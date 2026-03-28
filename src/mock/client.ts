import type { QueryClient, BroadcastSyncResponse, TxResponse } from '../types.js';
import type { Coin } from '../proto/coin.js';
import type { SubscriptionEvent } from '../rpc/websocket.js';
import { parseNewBlockEvent, type NewBlockEvent } from '../rpc/subscribe.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SimulateResult {
  gasUsed: bigint;
  gasWanted?: bigint;
}

interface BroadcastResult {
  code: number;
  hash: string;
  height?: bigint;
  log?: string;
}

interface AccountResult {
  accountNumber: bigint;
  sequence: bigint;
}

interface MockState {
  broadcasts: { txBytes: Uint8Array; result: BroadcastResult }[];
  queries: { path: string; data: Uint8Array; result: Uint8Array }[];
  simulations: { txBytes: Uint8Array; result: SimulateResult }[];
  /** Number of active subscriptions. */
  subscriptionCount: number;
}

interface MockTxArgs {
  messages: { typeUrl: string; value: Uint8Array }[];
  fee?: { amount: Coin[]; gasLimit: bigint };
  memo?: string;
}

/** The mock Rivet object type returned by createMockRivet. */
export interface MockRivet extends QueryClient {
  signAndBroadcast(
    txArgs: MockTxArgs,
    broadcastOptions: { mode: 'confirm' },
  ): Promise<{ broadcastResponse: TxResponse }>;
  signAndBroadcast(
    txArgs: MockTxArgs,
    broadcastOptions?: { mode?: 'sync' },
  ): Promise<{ broadcastResponse: BroadcastSyncResponse }>;

  simulate(txBytes: Uint8Array): Promise<SimulateResult>;

  getAccount(address: string): Promise<AccountResult>;

  /** Recorded calls for assertions. */
  readonly state: MockState;

  /** Clear all recorded state. */
  reset(): void;

  /** Configure a custom simulate handler. */
  onSimulate(handler: (txBytes: Uint8Array) => SimulateResult): MockRivet;

  /** Configure a custom broadcast handler. */
  onBroadcast(handler: (txBytes: Uint8Array) => BroadcastResult): MockRivet;

  /** Configure a custom query handler. */
  onQuery(handler: (path: string, data: Uint8Array) => Uint8Array): MockRivet;

  /** Configure a custom getAccount handler. */
  onGetAccount(handler: (address: string) => AccountResult): MockRivet;

  /** Subscribe to raw CometBFT events by query string. */
  subscribe(query: string, callback: (event: SubscriptionEvent) => void): () => void;

  /** Subscribe to parsed new block events. */
  subscribeBlocks(callback: (event: NewBlockEvent) => void): () => void;

  /** Emit a raw event to all callbacks registered for the given query. */
  emit(query: string, event: SubscriptionEvent): void;

  /** Emit a block event to all subscribeBlocks listeners. */
  emitBlock(): void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function defaultBroadcastResult(): BroadcastResult {
  return { code: 0, hash: DEFAULT_HASH, height: 100n };
}

function defaultSimulateResult(): SimulateResult {
  return { gasUsed: 200_000n, gasWanted: 200_000n };
}

function defaultAccountResult(): AccountResult {
  return { accountNumber: 0n, sequence: 0n };
}

function hashToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// createMockRivet
// ---------------------------------------------------------------------------

/**
 * Create a mock Rivet instance for testing.
 *
 * The mock satisfies QueryClient and exposes signAndBroadcast, simulate,
 * and getAccount with configurable handlers and call recording.
 *
 * @example
 * ```ts
 * const mock = createMockRivet()
 *   .onSimulate(() => ({ gasUsed: 200_000n }))
 *   .onBroadcast((txBytes) => ({ code: 0, hash: '...', height: 100n }));
 *
 * // Use mock.query() as a QueryClient
 * // Use mock.signAndBroadcast() like Rivet
 *
 * expect(mock.state.broadcasts).toHaveLength(1);
 * mock.reset();
 * ```
 */
export function createMockRivet(): MockRivet {
  let simulateHandler: (txBytes: Uint8Array) => SimulateResult = () => defaultSimulateResult();
  let broadcastHandler: (txBytes: Uint8Array) => BroadcastResult = () => defaultBroadcastResult();
  let queryHandler: (path: string, data: Uint8Array) => Uint8Array = () => new Uint8Array(0);
  let accountHandler: (address: string) => AccountResult = () => defaultAccountResult();

  const subscriptions = new Map<string, Set<(event: any) => void>>();

  const state: MockState = {
    broadcasts: [],
    queries: [],
    simulations: [],
    get subscriptionCount() {
      let count = 0;
      for (const cbs of subscriptions.values()) count += cbs.size;
      return count;
    },
  };

  const mock: MockRivet = {
    state,

    async query(path: string, data: Uint8Array): Promise<Uint8Array> {
      const result = queryHandler(path, data);
      state.queries.push({ path, data, result });
      return result;
    },

    signAndBroadcast: (async (txArgs: MockTxArgs, broadcastOptions?: { mode?: 'sync' | 'confirm' }) => {
      // Build a minimal "txBytes" from the messages for the handler
      const txBytes = new Uint8Array(
        txArgs.messages.reduce((acc, m) => acc + m.value.length, 0),
      );
      let offset = 0;
      for (const msg of txArgs.messages) {
        txBytes.set(msg.value, offset);
        offset += msg.value.length;
      }

      const result = broadcastHandler(txBytes);
      state.broadcasts.push({ txBytes, result });

      if (broadcastOptions?.mode === 'confirm') {
        return {
          broadcastResponse: {
            tx: txBytes,
            txResult: {
              code: result.code,
              log: result.log ?? '',
              gasUsed: 0n,
              gasWanted: 0n,
              events: [],
            },
            height: Number(result.height ?? 100n),
            hash: hashToBytes(result.hash),
          } satisfies TxResponse,
        };
      }

      return {
        broadcastResponse: {
          hash: hashToBytes(result.hash),
          code: result.code,
          log: result.log ?? '',
          gasUsed: 0n,
          gasWanted: 0n,
          events: [],
          info: '',
        } satisfies BroadcastSyncResponse,
      };
    }) as MockRivet['signAndBroadcast'],

    async simulate(txBytes: Uint8Array): Promise<SimulateResult> {
      const result = simulateHandler(txBytes);
      state.simulations.push({ txBytes, result });
      return result;
    },

    async getAccount(address: string): Promise<AccountResult> {
      return accountHandler(address);
    },

    reset() {
      state.broadcasts.length = 0;
      state.queries.length = 0;
      state.simulations.length = 0;
      subscriptions.clear();
    },

    onSimulate(handler) {
      simulateHandler = handler;
      return mock;
    },

    onBroadcast(handler) {
      broadcastHandler = handler;
      return mock;
    },

    onQuery(handler) {
      queryHandler = handler;
      return mock;
    },

    onGetAccount(handler) {
      accountHandler = handler;
      return mock;
    },

    subscribe(query: string, callback: (event: SubscriptionEvent) => void): () => void {
      if (!subscriptions.has(query)) subscriptions.set(query, new Set());
      const cbs = subscriptions.get(query)!;
      cbs.add(callback);
      return () => {
        cbs.delete(callback);
        if (cbs.size === 0) subscriptions.delete(query);
      };
    },

    subscribeBlocks(callback: (event: NewBlockEvent) => void): () => void {
      return mock.subscribe("tm.event='NewBlock'", (event) => {
        const parsed = parseNewBlockEvent(event);
        if (parsed) callback(parsed);
      });
    },

    emit(query: string, event: SubscriptionEvent): void {
      const cbs = subscriptions.get(query);
      if (cbs) for (const cb of cbs) cb(event);
    },

    emitBlock(): void {
      mock.emit("tm.event='NewBlock'", {
        query: "tm.event='NewBlock'",
        data: {
          type: 'tendermint/event/NewBlock',
          value: {
            block: {
              header: { height: '1', time: '2025-01-01T00:00:00Z' },
              data: { txs: [] },
              evidence: { evidence: [] },
              last_commit: null,
            },
            block_id: { hash: '', parts: { total: 1, hash: '' } },
            result_finalize_block: { events: [] },
          },
        },
        events: { 'tm.event': ['NewBlock'], 'block.height': ['1'] },
      });
    },
  };

  return mock;
}
