import { describe, it, expect } from 'vitest';
import { deriveWsUrl, RivetWebSocket } from '../src/rpc/websocket.js';
import type { SubscriptionEvent } from '../src/rpc/websocket.js';
import { parseNewBlockEvent, parseTxEvent, parseEvents } from '../src/rpc/subscribe.js';

// ---------------------------------------------------------------------------
// URL derivation
// ---------------------------------------------------------------------------

describe('deriveWsUrl', () => {
  it('converts http to ws', () => {
    expect(deriveWsUrl('http://localhost:26657')).toBe('ws://localhost:26657/websocket');
  });

  it('converts https to wss', () => {
    expect(deriveWsUrl('https://rpc.cosmos.network')).toBe('wss://rpc.cosmos.network/websocket');
  });

  it('strips trailing slash before appending /websocket', () => {
    expect(deriveWsUrl('http://localhost:26657/')).toBe('ws://localhost:26657/websocket');
  });

  it('does not double-append /websocket', () => {
    expect(deriveWsUrl('http://localhost:26657/websocket')).toBe('ws://localhost:26657/websocket');
  });

  it('passes through ws:// URLs', () => {
    expect(deriveWsUrl('ws://localhost:26657')).toBe('ws://localhost:26657/websocket');
  });

  it('handles URLs with paths', () => {
    expect(deriveWsUrl('https://rpc.example.com/rpc')).toBe('wss://rpc.example.com/rpc/websocket');
  });
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('subscribe module exports', () => {
  it('exports parsers and toAsyncGenerator', async () => {
    const mod = await import('../src/rpc/subscribe.js');
    expect(typeof mod.parseNewBlockEvent).toBe('function');
    expect(typeof mod.parseTxEvent).toBe('function');
    expect(typeof mod.parseEvents).toBe('function');
    expect(typeof mod.toAsyncGenerator).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// RivetWebSocket subscribe API
// ---------------------------------------------------------------------------

describe('RivetWebSocket subscribe', () => {
  it('subscribe returns an unsubscribe function', () => {
    const ws = new RivetWebSocket('http://localhost:26657');
    const unsub = ws.subscribe("tm.event='NewBlock'", () => {});
    expect(typeof unsub).toBe('function');
    expect(ws.subscriptionCount).toBe(1);
    unsub();
    expect(ws.subscriptionCount).toBe(0);
    ws.close();
  });

  it('supports multiple callbacks on the same query', () => {
    const ws = new RivetWebSocket('http://localhost:26657');
    const unsub1 = ws.subscribe("tm.event='NewBlock'", () => {});
    const unsub2 = ws.subscribe("tm.event='NewBlock'", () => {});
    // Same query — one subscription entry
    expect(ws.subscriptionCount).toBe(1);
    unsub1();
    // Still one sub because unsub2 is active
    expect(ws.subscriptionCount).toBe(1);
    unsub2();
    expect(ws.subscriptionCount).toBe(0);
    ws.close();
  });

  it('different queries count as separate subscriptions', () => {
    const ws = new RivetWebSocket('http://localhost:26657');
    const unsub1 = ws.subscribe("tm.event='NewBlock'", () => {});
    const unsub2 = ws.subscribe("tm.event='Tx'", () => {});
    expect(ws.subscriptionCount).toBe(2);
    unsub1();
    expect(ws.subscriptionCount).toBe(1);
    unsub2();
    expect(ws.subscriptionCount).toBe(0);
    ws.close();
  });

  it('close clears all subscriptions', () => {
    const ws = new RivetWebSocket('http://localhost:26657');
    ws.subscribe("tm.event='NewBlock'", () => {});
    ws.subscribe("tm.event='Tx'", () => {});
    expect(ws.subscriptionCount).toBe(2);
    ws.close();
    expect(ws.subscriptionCount).toBe(0);
  });

  it('SubscriptionEvent type is importable', () => {
    // Type-level check — if this compiles, the type exists
    const _event: SubscriptionEvent = { query: "tm.event='NewBlock'" };
    expect(_event.query).toBe("tm.event='NewBlock'");
  });
});

// ---------------------------------------------------------------------------
// Index exports
// ---------------------------------------------------------------------------

describe('index exports', () => {
  it('exports RivetWebSocket and SubscriptionEvent type', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod.RivetWebSocket).toBe('function');
    expect(typeof mod.deriveWsUrl).toBe('function');
  });

  it('does not export standalone subscribe functions', async () => {
    const mod = await import('../src/index.js');
    expect((mod as any).onNewBlock).toBeUndefined();
    expect((mod as any).onTx).toBeUndefined();
    expect((mod as any).subscribeNewBlock).toBeUndefined();
    expect((mod as any).subscribeTx).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Event parsers — CometBFT fixture data
// ---------------------------------------------------------------------------

// CometBFT v0.38 WebSocket NewBlock event — matches EventDataNewBlock struct
const NEW_BLOCK_FIXTURE = {
  query: "tm.event='NewBlock'",
  data: {
    type: 'tendermint/event/NewBlock',
    value: {
      block: {
        header: {
          version: { block: '11', app: '0' },
          chain_id: 'rebar-testnet-1',
          height: '12345',
          time: '2025-01-15T10:30:00.000000000Z',
          last_block_id: { hash: '', parts: { total: 0, hash: '' } },
          last_commit_hash: '',
          data_hash: '',
          validators_hash: '',
          next_validators_hash: '',
          consensus_hash: '',
          app_hash: '',
          last_results_hash: '',
          evidence_hash: '',
          proposer_address: '',
        },
        data: { txs: [] },
        evidence: { evidence: [] },
        last_commit: null,
      },
      block_id: {
        hash: '',
        parts: { total: 1, hash: '' },
      },
      result_finalize_block: {
        events: [],
        tx_results: null,
        validator_updates: null,
        consensus_param_updates: null,
        app_hash: '',
      },
    },
  },
  events: {
    'tm.event': ['NewBlock'],
    'block.height': ['12345'],
    'coin_received.receiver': ['rebar1abc', 'rebar1def'],
    'coin_received.amount': ['100urebar', '200urebar'],
  },
};

// Realistic CometBFT WebSocket Tx event shape
const TX_FIXTURE = {
  query: "tm.event='Tx'",
  data: {
    type: 'tendermint/event/Tx',
    value: {
      TxResult: {
        height: '12345',
        hash: 'A1B2C3D4E5F6',
        result: {
          code: 0,
          log: '',
          events: [],
        },
      },
    },
  },
  events: {
    'tm.event': ['Tx'],
    'tx.hash': ['A1B2C3D4E5F6'],
    'message.action': ['/cosmos.bank.v1beta1.MsgSend'],
    'transfer.sender': ['rebar1abc'],
    'transfer.recipient': ['rebar1def'],
    'transfer.amount': ['1000000urebar'],
  },
};

describe('parseNewBlockEvent', () => {
  it('parses a CometBFT NewBlock event', () => {
    const result = parseNewBlockEvent(NEW_BLOCK_FIXTURE);
    expect(result).not.toBeNull();
    expect(result!.height).toBe(12345n);
    expect(result!.time).toBe('2025-01-15T10:30:00.000000000Z');
    expect(result!.events.length).toBeGreaterThan(0);

    const coinReceived = result!.events.filter(e => e.type === 'coin_received');
    expect(coinReceived).toHaveLength(2);
    expect(coinReceived[0].attributes).toEqual({ receiver: 'rebar1abc', amount: '100urebar' });
    expect(coinReceived[1].attributes).toEqual({ receiver: 'rebar1def', amount: '200urebar' });
  });

  it('returns null for missing or malformed data', () => {
    expect(parseNewBlockEvent({})).toBeNull();
    expect(parseNewBlockEvent({ data: {} })).toBeNull();
    expect(parseNewBlockEvent({ data: { value: {} } })).toBeNull();
    expect(parseNewBlockEvent({ data: { value: { block: {} } } })).toBeNull();
    expect(parseNewBlockEvent(null)).toBeNull();
    expect(parseNewBlockEvent('not an object')).toBeNull();
  });
});

describe('parseTxEvent', () => {
  it('parses a CometBFT Tx event', () => {
    const result = parseTxEvent(TX_FIXTURE);
    expect(result).not.toBeNull();
    expect(result!.height).toBe(12345n);
    expect(result!.hash).toBe('A1B2C3D4E5F6');
    expect(result!.code).toBe(0);
    expect(result!.log).toBe('');

    const transfer = result!.events.find(e => e.type === 'transfer');
    expect(transfer).toBeDefined();
    expect(transfer!.attributes).toEqual({ sender: 'rebar1abc', recipient: 'rebar1def', amount: '1000000urebar' });
  });

  it('parses a failed tx (non-zero code)', () => {
    const failedTx = structuredClone(TX_FIXTURE);
    failedTx.data.value.TxResult.result.code = 5;
    failedTx.data.value.TxResult.result.log = 'insufficient funds';

    const result = parseTxEvent(failedTx);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(5);
    expect(result!.log).toBe('insufficient funds');
  });

  it('returns null for missing or malformed data', () => {
    expect(parseTxEvent({})).toBeNull();
    expect(parseTxEvent({ data: {} })).toBeNull();
    expect(parseTxEvent({ data: { value: {} } })).toBeNull();
    expect(parseTxEvent(null)).toBeNull();
  });
});

describe('parseEvents', () => {
  it('zips parallel arrays into per-instance events', () => {
    const events = parseEvents({
      'transfer.sender': ['rebar1abc'],
      'transfer.recipient': ['rebar1def'],
      'transfer.amount': ['1000urebar'],
      'message.action': ['/cosmos.bank.v1beta1.MsgSend'],
    });

    expect(events).toHaveLength(2);

    const transfer = events.find(e => e.type === 'transfer')!;
    expect(transfer.attributes).toEqual({ sender: 'rebar1abc', recipient: 'rebar1def', amount: '1000urebar' });

    const message = events.find(e => e.type === 'message')!;
    expect(message.attributes).toEqual({ action: '/cosmos.bank.v1beta1.MsgSend' });
  });

  it('produces one event per instance from parallel arrays', () => {
    const events = parseEvents({
      'coin_received.receiver': ['rebar1abc', 'rebar1def'],
      'coin_received.amount': ['100urebar', '200urebar'],
      'nodot': ['ignored'],
    });

    const coinEvents = events.filter(e => e.type === 'coin_received');
    expect(coinEvents).toHaveLength(2);
    expect(coinEvents[0].attributes).toEqual({ receiver: 'rebar1abc', amount: '100urebar' });
    expect(coinEvents[1].attributes).toEqual({ receiver: 'rebar1def', amount: '200urebar' });
    expect(events.find(e => e.type === 'nodot')).toBeUndefined();
  });

  it('returns empty array for undefined/empty input', () => {
    expect(parseEvents(undefined)).toEqual([]);
    expect(parseEvents({})).toEqual([]);
  });
});
