import type { TendermintRpc } from './client.js';
import type { BroadcastSyncResponse, BroadcastCommitResponse, TxResponse, Event } from '../types.js';
import { getTx } from './search.js';
import { TimeoutError } from '../errors.js';
import { classifyBroadcastError } from '../error-classify.js';

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function parseEvents(raw: unknown[]): Event[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((evt: unknown) => {
    const e = evt as Record<string, unknown>;
    const attributes: Record<string, string> = {};
    if (Array.isArray(e['attributes'])) {
      for (const a of e['attributes'] as Record<string, unknown>[]) {
        const key = (a['key'] as string) ?? '';
        if (key) attributes[key] = (a['value'] as string) ?? '';
      }
    }
    return { type: (e['type'] as string) ?? '', attributes };
  });
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function parseHash(hash: unknown): Uint8Array {
  if (typeof hash === 'string') return hexToBytes(hash);
  return new Uint8Array(0);
}

/** Broadcast using broadcast_sync — returns once the tx passes CheckTx. */
export async function broadcastTxSync(rpc: TendermintRpc, txBytes: Uint8Array): Promise<BroadcastSyncResponse> {
  const result = await rpc.call('broadcast_tx_sync', {
    tx: toBase64(txBytes),
  }) as Record<string, unknown>;

  return {
    hash: parseHash(result['hash']),
    code: (result['code'] as number) ?? 0,
    data: result['data'] ? hexToBytes(result['data'] as string) : undefined,
    log: (result['log'] as string) ?? '',
    gasUsed: BigInt((result['gas_used'] as string | number) ?? 0),
    gasWanted: BigInt((result['gas_wanted'] as string | number) ?? 0),
    events: parseEvents(result['events'] as unknown[] ?? []),
    info: (result['info'] as string) ?? '',
  };
}

/** Broadcast using broadcast_tx_commit — waits for the tx to be included in a block. */
export async function broadcastTxCommit(rpc: TendermintRpc, txBytes: Uint8Array): Promise<BroadcastCommitResponse> {
  const result = await rpc.call('broadcast_tx_commit', {
    tx: toBase64(txBytes),
  }) as Record<string, unknown>;

  const hash = parseHash(result['hash']);
  const height = BigInt((result['height'] as string | number) ?? 0);

  const checkTxRaw = (result['check_tx'] ?? {}) as Record<string, unknown>;
  const txResultRaw = (result['tx_result'] ?? result['deliver_tx'] ?? {}) as Record<string, unknown>;

  const checkTx = {
    code: (checkTxRaw['code'] as number) ?? 0,
    log: (checkTxRaw['log'] as string) ?? '',
    data: checkTxRaw['data'] ? hexToBytes(checkTxRaw['data'] as string) : undefined,
    gasUsed: BigInt((checkTxRaw['gas_used'] as string | number) ?? 0),
    gasWanted: BigInt((checkTxRaw['gas_wanted'] as string | number) ?? 0),
    events: parseEvents(checkTxRaw['events'] as unknown[] ?? []),
    info: (checkTxRaw['info'] as string) ?? '',
  };

  const txResult = {
    code: (txResultRaw['code'] as number) ?? 0,
    log: (txResultRaw['log'] as string) ?? '',
    data: txResultRaw['data'] ? hexToBytes(txResultRaw['data'] as string) : undefined,
    gasUsed: BigInt((txResultRaw['gas_used'] as string | number) ?? 0),
    gasWanted: BigInt((txResultRaw['gas_wanted'] as string | number) ?? 0),
    events: parseEvents(txResultRaw['events'] as unknown[] ?? []),
    info: (txResultRaw['info'] as string) ?? '',
  };

  // Determine the "top-level" response from the more significant result
  const primary = checkTx.code !== 0 ? checkTx : txResult;

  return {
    hash,
    code: primary.code,
    data: primary.data,
    log: primary.log,
    gasUsed: primary.gasUsed,
    gasWanted: primary.gasWanted,
    events: primary.events,
    info: primary.info,
    height,
    checkTx,
    txResult,
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export interface ConfirmOptions {
  /** Max time to wait for block inclusion (default: 60000ms). */
  timeoutMs?: number;
  /** Polling interval (default: 2000ms). */
  pollIntervalMs?: number;
}

/**
 * Broadcast via sync, then poll for block inclusion.
 *
 * More reliable than broadcast_tx_commit, which can time out if block
 * production is slow. This is the pattern CosmJS converged on.
 */
export async function broadcastTxConfirm(
  rpc: TendermintRpc,
  txBytes: Uint8Array,
  opts?: ConfirmOptions,
): Promise<TxResponse> {
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 2_000;

  const syncResult = await broadcastTxSync(rpc, txBytes);

  if (syncResult.code !== 0) {
    const hashHex = bytesToHex(syncResult.hash);
    throw classifyBroadcastError(syncResult.code, syncResult.log, hashHex);
  }

  const hashHex = bytesToHex(syncResult.hash);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, pollIntervalMs));
    const tx = await getTx(rpc, hashHex);
    if (tx) return tx;
  }

  throw new TimeoutError(timeoutMs, hashHex);
}
