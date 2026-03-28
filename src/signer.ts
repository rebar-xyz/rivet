import { TendermintRpc } from './rpc/client.js';
import { GrpcClient } from './rpc/grpc.js';
import { broadcastTxSync, broadcastTxConfirm } from './rpc/broadcast.js';
import { simulateTx } from './rpc/simulate.js';
import type { SimulationResult } from './rpc/simulate.js';
import { getAccount } from './rpc/account.js';
import { buildTxBody, buildAuthInfo } from './tx/build.js';
import { encodeTxRaw } from './tx/encode.js';
import { calculateFee, applyGasMultiplier } from './tx/fee.js';
import type { Coin } from './proto/coin.js';
import { SignMode } from './proto/tx.js';
import type { SignDoc } from './proto/tx.js';
import type { OfflineDirectSigner } from './wallet/types.js';
import type { TxResponse, BroadcastSyncResponse, SignerConfig, QueryClient } from './types.js';
import { RivetError, SigningRejectedError } from './errors.js';
import { classifyBroadcastError } from './error-classify.js';
import { RivetWebSocket } from './rpc/websocket.js';
import type { SubscriptionEvent } from './rpc/websocket.js';
import type { WebSocketOptions } from './types.js';
import { parseNewBlockEvent, parseTxEvent, toAsyncGenerator } from './rpc/subscribe.js';
import type { NewBlockEvent, TxEvent } from './rpc/subscribe.js';

const DEFAULT_GAS_MULTIPLIER = 1.75;

/**
 * Rough gas estimate used to populate the fee field during simulation so the
 * simulated tx size (and thus ConsumeGasForTxSizeDecorator) is realistic. The
 * exact value doesn't matter — only the byte length of the resulting fee string
 * affects size-based gas, and a few bytes of difference is negligible.
 */
const SIMULATION_GAS_ESTIMATE = 200_000n;

/**
 * High-level Cosmos transaction signer and query client.
 *
 * Handles gas estimation, signing, broadcasting, and ABCI queries.
 * Messages must be pre-encoded (use defineProto or encodeMessage).
 */
export class Rivet {
  private readonly _rpc: TendermintRpc;
  private readonly _queryClient: QueryClient;
  private readonly gasMultiplier: number;
  private readonly gasPrice: string | undefined;
  private readonly wallet: OfflineDirectSigner | undefined;
  private _chainId: string | undefined;
  private _ws: RivetWebSocket | null = null;
  private readonly _wsOptions: WebSocketOptions | undefined;

  constructor(
    wallet: OfflineDirectSigner | undefined,
    config: SignerConfig,
  ) {
    this._rpc = new TendermintRpc(config.rpcUrl);
    this._queryClient = config.grpcUrl ? new GrpcClient(config.grpcUrl) : this._rpc;
    this._chainId = config.chainId;
    this.wallet = wallet;
    this.gasMultiplier = config.gasConfig?.multiplier ?? DEFAULT_GAS_MULTIPLIER;
    this.gasPrice = config.gasConfig?.gasPrice;
    this._wsOptions = config.ws;
  }

  /**
   * Create a Rivet instance.
   *
   * Without a wallet config, the client is read-only (queries only).
   * With a wallet, the client can sign and broadcast transactions.
   *
   * @example
   * // Read-only
   * const rivet = Rivet.connect('http://localhost:26657');
   *
   * // Full client
   * const rivet = Rivet.connect('http://localhost:26657', { wallet, gasConfig });
   */
  static connect(
    rpcUrl: string,
    config?: {
      wallet?: OfflineDirectSigner;
      gasConfig?: { multiplier?: number; gasPrice?: string };
      chainId?: string;
      grpcUrl?: string;
      ws?: WebSocketOptions;
    },
  ): Rivet {
    return new Rivet(config?.wallet, {
      rpcUrl,
      grpcUrl: config?.grpcUrl,
      chainId: config?.chainId,
      gasConfig: config?.gasConfig,
      ws: config?.ws,
    });
  }

  private async resolveChainId(): Promise<string> {
    if (!this._chainId) {
      this._chainId = await this._rpc.getChainId();
    }
    return this._chainId;
  }

  get rpc(): TendermintRpc {
    return this._rpc;
  }

  /**
   * Execute a protobuf query against the chain.
   * Satisfies QueryClient so Rivet can be passed directly
   * to query helpers produced by defineProto.
   */
  async query(path: string, data: Uint8Array): Promise<Uint8Array> {
    return this._queryClient.query(path, data);
  }

  /**
   * Sign and broadcast a transaction.
   *
   * Messages must be pre-encoded as { typeUrl, value: Uint8Array }.
   * Use defineProto() or encodeMessage() to encode messages before passing.
   *
   * @throws {RivetError} If no wallet is configured.
   */
  async signAndBroadcast(
    txArgs: {
      messages: { typeUrl: string; value: Uint8Array }[];
      fee?: { amount: Coin[]; gasLimit: bigint };
      memo?: string;
      options?: {
        timeoutHeight?: bigint;
        unordered?: boolean;
        timeoutTimestamp?: { type: 'absolute'; value: Date };
        sequence?: bigint;
        multiplier?: number;
        gasPrice?: string;
      };
    },
    broadcastOptions: { mode: 'confirm'; timeoutMs?: number; pollIntervalMs?: number },
  ): Promise<{ broadcastResponse: TxResponse }>;
  async signAndBroadcast(
    txArgs: {
      messages: { typeUrl: string; value: Uint8Array }[];
      fee?: { amount: Coin[]; gasLimit: bigint };
      memo?: string;
      options?: {
        timeoutHeight?: bigint;
        unordered?: boolean;
        timeoutTimestamp?: { type: 'absolute'; value: Date };
        sequence?: bigint;
        multiplier?: number;
        gasPrice?: string;
      };
    },
    broadcastOptions?: { mode?: 'sync'; timeoutMs?: number; pollIntervalMs?: number },
  ): Promise<{ broadcastResponse: BroadcastSyncResponse }>;
  async signAndBroadcast(
    txArgs: {
      messages: { typeUrl: string; value: Uint8Array }[];
      fee?: { amount: Coin[]; gasLimit: bigint };
      memo?: string;
      options?: {
        timeoutHeight?: bigint;
        unordered?: boolean;
        timeoutTimestamp?: { type: 'absolute'; value: Date };
        sequence?: bigint;
        multiplier?: number;
        gasPrice?: string;
      };
    },
    broadcastOptions?: { mode?: 'sync' | 'confirm'; timeoutMs?: number; pollIntervalMs?: number },
  ): Promise<{ broadcastResponse: TxResponse | BroadcastSyncResponse }> {
    if (!this.wallet) {
      throw new RivetError('No wallet configured. Use Rivet.connect(url, { wallet }) for signing.', 'NO_WALLET');
    }

    const mode = broadcastOptions?.mode ?? 'sync';
    const accounts = await this.wallet.getAccounts();
    const signer = accounts[0];
    if (!signer) {
      throw new Error('No accounts available from wallet');
    }

    const unordered = txArgs.options?.unordered ?? false;
    const timeoutTimestamp = txArgs.options?.timeoutTimestamp?.value;
    const timeoutHeight = txArgs.options?.timeoutHeight;

    // Get account info
    const [accountInfo, chainId] = await Promise.all([
      getAccount(this._queryClient, signer.address),
      this.resolveChainId(),
    ]);
    const accountNumber = accountInfo.accountNumber;
    const sequence = txArgs.options?.sequence ?? accountInfo.sequence;

    // Build TxBody from pre-encoded messages
    const bodyBytes = buildTxBody(txArgs.messages, {
      memo: txArgs.memo,
      timeoutHeight,
      unordered,
      timeoutTimestamp,
    });

    // Determine fee: explicit, or auto via simulation
    let fee: { amount: Coin[]; gasLimit: bigint };
    if (txArgs.fee) {
      fee = txArgs.fee;
    } else {
      const multiplier = txArgs.options?.multiplier ?? this.gasMultiplier;
      const gasPrice = txArgs.options?.gasPrice ?? this.gasPrice;
      if (!gasPrice) {
        throw new RivetError(
          'gasPrice is required for auto gas estimation. Provide it in SignerConfig.gasConfig or per-transaction options.',
          'GAS_PRICE_REQUIRED',
        );
      }

      // Build temp AuthInfo with estimated fee for simulation (so tx size matches final)
      const initialGasEstimate = SIMULATION_GAS_ESTIMATE;
      const estimatedFee = calculateFee(initialGasEstimate, gasPrice);
      const simAuthInfo = buildAuthInfo(
        { publicKey: signer.pubkey, sequence, signMode: SignMode.DIRECT },
        estimatedFee,
      );
      const simTxBytes = encodeTxRaw(bodyBytes, simAuthInfo, [new Uint8Array(64)]);

      const simResult = await simulateTx(this._queryClient, simTxBytes);
      const gasLimit = applyGasMultiplier(simResult.gasUsed, multiplier);
      fee = calculateFee(gasLimit, gasPrice);
    }

    // Build final AuthInfo
    const authInfoBytes = buildAuthInfo(
      { publicKey: signer.pubkey, sequence, signMode: SignMode.DIRECT },
      fee,
    );

    // Build SignDoc and sign
    const signDoc: SignDoc = {
      bodyBytes,
      authInfoBytes,
      chainId,
      accountNumber,
    };

    // External wallets (Keplr, Leap) may return non-standard shapes at runtime:
    // signature as base64 string or StdSignature object, bodyBytes/authInfoBytes
    // as base64 strings, accountNumber as Long/number. We cast to a wider type
    // here so extractSignature/normalizeSignedDoc can handle all shapes.
    let signResponse: {
      signed: { bodyBytes: unknown; authInfoBytes: unknown; chainId: string; accountNumber: unknown };
      signature: Uint8Array | { signature: string | Uint8Array; pub_key?: unknown };
    };
    try {
      signResponse = await this.wallet.signDirect(signer.address, signDoc);
    } catch (err) {
      if (err instanceof Error && /reject|denied|cancel/i.test(err.message)) {
        throw new SigningRejectedError(err.message);
      }
      throw err;
    }

    // Normalize response from potentially non-standard wallets
    const normalizedDoc = normalizeSignedDoc(signResponse.signed);
    const signature = extractSignature(signResponse.signature);

    // Defense-in-depth: verify the wallet didn't modify the SignDoc
    if (!bytesEqual(normalizedDoc.bodyBytes, bodyBytes) || !bytesEqual(normalizedDoc.authInfoBytes, authInfoBytes)) {
      throw new RivetError(
        'Wallet returned a modified SignDoc. The signed bodyBytes or authInfoBytes differ from the original.',
        'SIGN_DOC_MISMATCH',
      );
    }

    if (signature.length !== 64) {
      throw new RivetError(
        `Expected 64-byte secp256k1 signature, got ${signature.length} bytes`,
        'INVALID_SIGNATURE',
      );
    }

    // Encode final TxRaw
    const txBytes = encodeTxRaw(
      normalizedDoc.bodyBytes,
      normalizedDoc.authInfoBytes,
      [signature],
    );

    // Broadcast
    if (mode === 'confirm') {
      // broadcastTxConfirm throws on CheckTx failure; check execution result
      const confirmResult = await broadcastTxConfirm(this._rpc, txBytes, {
        timeoutMs: broadcastOptions?.timeoutMs,
        pollIntervalMs: broadcastOptions?.pollIntervalMs,
      });

      if (confirmResult.txResult.code !== 0) {
        const hashHex = bytesToHex(confirmResult.hash);
        throw classifyBroadcastError(confirmResult.txResult.code, confirmResult.txResult.log, hashHex);
      }

      return { broadcastResponse: confirmResult };
    } else {
      const syncResult = await broadcastTxSync(this._rpc, txBytes);

      if (syncResult.code !== 0) {
        const hashHex = bytesToHex(syncResult.hash);
        throw classifyBroadcastError(syncResult.code, syncResult.log, hashHex);
      }

      return { broadcastResponse: syncResult };
    }
  }

  async getAccount(address: string): Promise<{ accountNumber: bigint; sequence: bigint }> {
    return getAccount(this._queryClient, address);
  }

  // ---------------------------------------------------------------------------
  // WebSocket subscriptions (all share one connection per Rivet instance)
  // ---------------------------------------------------------------------------

  private _getWs(): RivetWebSocket {
    if (!this._ws) {
      this._ws = new RivetWebSocket(this._rpc.url, this._wsOptions);
    }
    return this._ws;
  }

  /** Subscribe to any CometBFT query. Returns an unsubscribe function. */
  subscribe(query: string, callback: (event: SubscriptionEvent) => void): () => void {
    return this._getWs().subscribe(query, callback as (event: unknown) => void);
  }

  /** Subscribe to new blocks via callback. Returns an unsubscribe function. */
  subscribeBlocks(callback: (event: NewBlockEvent) => void): () => void {
    return this._getWs().subscribe("tm.event='NewBlock'", (event: unknown) => {
      const parsed = parseNewBlockEvent(event);
      if (parsed) callback(parsed);
    });
  }

  /** Subscribe to transactions via callback. Returns an unsubscribe function. */
  subscribeTxs(query: string, callback: (event: TxEvent) => void): () => void {
    const fullQuery = query.includes("tm.event") ? query : `tm.event='Tx' AND ${query}`;
    return this._getWs().subscribe(fullQuery, (event: unknown) => {
      const parsed = parseTxEvent(event);
      if (parsed) callback(parsed);
    });
  }

  /** Stream new blocks via async generator. */
  async *streamBlocks(options?: { signal?: AbortSignal }): AsyncGenerator<NewBlockEvent> {
    yield* toAsyncGenerator<NewBlockEvent>(
      (cb) => this.subscribeBlocks(cb),
      options?.signal,
    );
  }

  /** Stream transactions via async generator. */
  async *streamTxs(query: string, options?: { signal?: AbortSignal }): AsyncGenerator<TxEvent> {
    yield* toAsyncGenerator<TxEvent>(
      (cb) => this.subscribeTxs(query, cb),
      options?.signal,
    );
  }

  /** Remove all subscriptions and close the connection. */
  unsubscribeAll(): void {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  async simulate(
    messages: { typeUrl: string; value: Uint8Array }[],
    signerAddress: string,
    options?: {
      memo?: string;
      timeoutHeight?: bigint;
      unordered?: boolean;
      timeoutTimestamp?: Date;
    },
  ): Promise<SimulationResult> {
    if (!this.wallet) {
      throw new RivetError('No wallet configured. Use Rivet.connect(url, { wallet }) for simulation.', 'NO_WALLET');
    }

    const accounts = await this.wallet.getAccounts();
    const signer = accounts.find(a => a.address === signerAddress);
    if (!signer) {
      throw new Error(`Signer address ${signerAddress} not found in wallet accounts`);
    }

    const { sequence } = await getAccount(this._queryClient, signer.address);
    const bodyBytes = buildTxBody(messages, options);

    // Use estimated fee for accurate tx size
    const gasPrice = this.gasPrice ?? '0.025urebar';
    const estimatedFee = calculateFee(SIMULATION_GAS_ESTIMATE, gasPrice);
    const authInfoBytes = buildAuthInfo(
      { publicKey: signer.pubkey, sequence, signMode: SignMode.DIRECT },
      estimatedFee,
    );
    const txBytes = encodeTxRaw(bodyBytes, authInfoBytes, [new Uint8Array(64)]);

    return simulateTx(this._queryClient, txBytes);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromBase64(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(str, 'base64'));
  }
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Extract raw 64-byte signature from various wallet response shapes.
 * Handles: raw Uint8Array, cosmjs StdSignature { signature: base64String },
 * and intermediate { signature: Uint8Array }.
 */
export function extractSignature(sig: Uint8Array | { signature: string | Uint8Array; pub_key?: unknown }): Uint8Array {
  if (sig instanceof Uint8Array) return sig;
  if (sig && typeof sig === 'object' && 'signature' in sig) {
    const inner = sig.signature;
    if (inner instanceof Uint8Array) return inner;
    if (typeof inner === 'string') return fromBase64(inner);
  }
  throw new RivetError('Unrecognized signature format from wallet', 'INVALID_SIGNATURE');
}

/**
 * Normalize a SignDoc returned by a wallet, handling Keplr/cosmjs quirks:
 * bodyBytes/authInfoBytes may be base64 strings, accountNumber may be
 * a cosmjs Long or number instead of bigint.
 */
export function normalizeSignedDoc(doc: {
  bodyBytes: unknown; authInfoBytes: unknown; chainId: string; accountNumber: unknown;
}): SignDoc {
  const bodyBytes = typeof doc.bodyBytes === 'string'
    ? fromBase64(doc.bodyBytes)
    : doc.bodyBytes as Uint8Array;
  const authInfoBytes = typeof doc.authInfoBytes === 'string'
    ? fromBase64(doc.authInfoBytes)
    : doc.authInfoBytes as Uint8Array;
  const accountNumber = typeof doc.accountNumber === 'bigint'
    ? doc.accountNumber
    : BigInt(doc.accountNumber as number | string);
  return { bodyBytes, authInfoBytes, chainId: doc.chainId, accountNumber };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
