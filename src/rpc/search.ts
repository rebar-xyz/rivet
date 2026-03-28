import type { TendermintRpc } from './client.js';
import type { TxResponse, Event } from '../types.js';

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
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

function hexToBase64(hex: string): string {
  return toBase64(hexToBytes(hex));
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

function parseTxResponse(raw: Record<string, unknown>): TxResponse {
  const txResultRaw = (raw['tx_result'] ?? {}) as Record<string, unknown>;

  return {
    tx: raw['tx'] ? fromBase64(raw['tx'] as string) : new Uint8Array(0),
    txResult: {
      code: (txResultRaw['code'] as number) ?? 0,
      log: (txResultRaw['log'] as string) ?? '',
      data: txResultRaw['data'] ? fromBase64(txResultRaw['data'] as string) : undefined,
      gasUsed: BigInt((txResultRaw['gas_used'] as string | number) ?? 0),
      gasWanted: BigInt((txResultRaw['gas_wanted'] as string | number) ?? 0),
      events: parseEvents(txResultRaw['events'] as unknown[] ?? []),
    },
    height: Number(raw['height'] ?? 0),
    hash: raw['hash'] ? hexToBytes(raw['hash'] as string) : new Uint8Array(0),
  };
}

export interface SearchOptions {
  page?: number;
  perPage?: number;
  orderBy?: 'asc' | 'desc';
}

/** Search transactions by event query string. */
export async function searchTxs(
  rpc: TendermintRpc,
  query: string,
  opts?: SearchOptions,
): Promise<{ txs: TxResponse[]; totalCount: number }> {
  const params: Record<string, unknown> = {
    query,
    page: String(opts?.page ?? 1),
    per_page: String(opts?.perPage ?? 50),
    order_by: opts?.orderBy ?? 'desc',
  };

  const result = await rpc.call('tx_search', params) as Record<string, unknown>;

  const rawTxs = (result['txs'] ?? []) as Record<string, unknown>[];
  const totalCount = Number(result['total_count'] ?? 0);

  return {
    txs: rawTxs.map(parseTxResponse),
    totalCount,
  };
}

/** Get a single transaction by hash (hex string). */
export async function getTx(
  rpc: TendermintRpc,
  hash: string,
): Promise<TxResponse | null> {
  try {
    // Tendermint JSON-RPC expects hash as base64, not hex
    const hashBase64 = hexToBase64(hash);
    const result = await rpc.call('tx', {
      hash: hashBase64,
      prove: false,
    }) as Record<string, unknown>;

    return parseTxResponse(result);
  } catch {
    return null;
  }
}
