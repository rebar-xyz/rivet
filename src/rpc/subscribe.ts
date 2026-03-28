import type { Event } from '../types.js';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface NewBlockEvent {
  height: bigint;
  time: string;
  events: Event[];
}

export interface TxEvent {
  height: bigint;
  hash: string;
  code: number;
  log: string;
  events: Event[];
}

// ---------------------------------------------------------------------------
// Event parsers
// ---------------------------------------------------------------------------

export function parseNewBlockEvent(data: unknown): NewBlockEvent | null {
  try {
    const result = data as Record<string, unknown>;
    const eventData = result['data'] as Record<string, unknown> | undefined;
    if (!eventData) return null;

    const value = eventData['value'] as Record<string, unknown>;
    const block = value?.['block'] as Record<string, unknown>;
    const header = block?.['header'] as Record<string, unknown>;

    if (!header) return null;

    const height = BigInt(header['height'] as string);
    const time = (header['time'] as string) ?? '';
    const events = parseEvents(result['events'] as Record<string, string[]> | undefined);

    return { height, time, events };
  } catch {
    return null;
  }
}

export function parseTxEvent(data: unknown): TxEvent | null {
  try {
    const result = data as Record<string, unknown>;
    const eventData = result['data'] as Record<string, unknown> | undefined;
    if (!eventData) return null;

    const value = eventData['value'] as Record<string, unknown>;
    const txResult = value?.['TxResult'] as Record<string, unknown>;

    if (!txResult) return null;

    const height = BigInt(txResult['height'] as string);
    const hashBytes = txResult['hash'] as string ?? '';
    const innerResult = txResult['result'] as Record<string, unknown>;
    const code = (innerResult?.['code'] as number) ?? 0;
    const log = (innerResult?.['log'] as string) ?? '';
    const events = parseEvents(result['events'] as Record<string, string[]> | undefined);

    return { height, hash: hashBytes, code, log, events };
  } catch {
    return null;
  }
}

/**
 * Convert CometBFT WebSocket flat event map to per-instance Event[].
 *
 * CometBFT flattens ABCI events into `{"type.attr": ["v1","v2"]}` where
 * arrays are parallel by index — `type.attr[i]` belongs to event instance i.
 * We zip them back into one Event per instance.
 *
 * Note: this relies on well-behaved modules emitting the same attributes for
 * every instance of a given event type. If an instance omits an attribute,
 * index alignment is lost (a known CometBFT limitation, see tendermint#5963).
 */
export function parseEvents(raw: Record<string, string[]> | undefined): Event[] {
  if (!raw) return [];

  // Group {attr → values[]} by event type
  const byType = new Map<string, Map<string, string[]>>();
  for (const [compositeKey, values] of Object.entries(raw)) {
    const dotIdx = compositeKey.indexOf('.');
    if (dotIdx === -1) continue;
    const type = compositeKey.slice(0, dotIdx);
    const attr = compositeKey.slice(dotIdx + 1);
    if (!byType.has(type)) byType.set(type, new Map());
    byType.get(type)!.set(attr, values);
  }

  // Zip parallel arrays into per-instance events
  const events: Event[] = [];
  for (const [type, attrs] of byType) {
    const instanceCount = Math.max(...Array.from(attrs.values(), v => v.length));
    for (let i = 0; i < instanceCount; i++) {
      const attributes: Record<string, string> = {};
      for (const [key, values] of attrs) {
        if (i < values.length) attributes[key] = values[i];
      }
      events.push({ type, attributes });
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Push→pull bridge for async generators
// ---------------------------------------------------------------------------

export async function* toAsyncGenerator<T>(
  subscribe: (callback: (event: T) => void) => () => void,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  const buffer: T[] = [];
  let resolve: (() => void) | null = null;
  let done = false;

  const unsub = subscribe((event) => {
    buffer.push(event);
    resolve?.();
  });

  const onAbort = () => {
    done = true;
    resolve?.();
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (!done) {
      if (buffer.length > 0) {
        yield buffer.shift()!;
      } else {
        await new Promise<void>(r => { resolve = r; });
        resolve = null;
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    unsub();
  }
}
