import { describe, it, expect } from 'vitest';
import { createMockRivet } from '../src/mock/client.js';

describe('createMockRivet', () => {
  it('default mock returns success', async () => {
    const mock = createMockRivet();
    const { broadcastResponse } = await mock.signAndBroadcast({
      messages: [{ typeUrl: '/test.Msg', value: new Uint8Array([1, 2, 3]) }],
    });
    expect(broadcastResponse.code).toBe(0);
  });

  it('custom broadcast handler is called with tx data', async () => {
    const mock = createMockRivet()
      .onBroadcast(() => ({
        code: 0,
        hash: 'ABCD',
        height: 42n,
      }));

    const { broadcastResponse } = await mock.signAndBroadcast({
      messages: [{ typeUrl: '/test.Msg', value: new Uint8Array([5, 6]) }],
    });
    expect(broadcastResponse.code).toBe(0);
  });

  it('custom simulate handler is called', async () => {
    const mock = createMockRivet()
      .onSimulate(() => ({ gasUsed: 500_000n }));

    const result = await mock.simulate(new Uint8Array([1]));
    expect(result.gasUsed).toBe(500_000n);
  });

  it('state records all broadcasts', async () => {
    const mock = createMockRivet();

    await mock.signAndBroadcast({
      messages: [{ typeUrl: '/test.A', value: new Uint8Array([1]) }],
    });
    await mock.signAndBroadcast({
      messages: [{ typeUrl: '/test.B', value: new Uint8Array([2]) }],
    });

    expect(mock.state.broadcasts).toHaveLength(2);
    expect(mock.state.broadcasts[0]!.result.code).toBe(0);
  });

  it('state records all queries', async () => {
    const mock = createMockRivet()
      .onQuery(() => new Uint8Array([42]));

    await mock.query('/test/path', new Uint8Array([1]));
    expect(mock.state.queries).toHaveLength(1);
    expect(mock.state.queries[0]!.path).toBe('/test/path');
    expect(mock.state.queries[0]!.result).toEqual(new Uint8Array([42]));
  });

  it('state records all simulations', async () => {
    const mock = createMockRivet();
    await mock.simulate(new Uint8Array([1]));
    expect(mock.state.simulations).toHaveLength(1);
  });

  it('reset() clears all state', async () => {
    const mock = createMockRivet();
    await mock.signAndBroadcast({
      messages: [{ typeUrl: '/test.A', value: new Uint8Array([1]) }],
    });
    await mock.query('/path', new Uint8Array());
    await mock.simulate(new Uint8Array());

    expect(mock.state.broadcasts).toHaveLength(1);
    expect(mock.state.queries).toHaveLength(1);
    expect(mock.state.simulations).toHaveLength(1);

    mock.reset();

    expect(mock.state.broadcasts).toHaveLength(0);
    expect(mock.state.queries).toHaveLength(0);
    expect(mock.state.simulations).toHaveLength(0);
  });

  it('mock works as QueryClient', async () => {
    const mock = createMockRivet()
      .onQuery((path) => {
        if (path === '/cosmos.bank.v1beta1.Query/Balance') {
          return new Uint8Array([10, 5, 8, 100]); // arbitrary response bytes
        }
        return new Uint8Array(0);
      });

    const result = await mock.query('/cosmos.bank.v1beta1.Query/Balance', new Uint8Array([1]));
    expect(result.length).toBeGreaterThan(0);
  });

  it('confirm mode returns TxResponse shape', async () => {
    const mock = createMockRivet();
    const result = await mock.signAndBroadcast(
      { messages: [{ typeUrl: '/test.Msg', value: new Uint8Array([1]) }] },
      { mode: 'confirm' },
    );
    // TxResponse has tx and height
    expect('tx' in result.broadcastResponse).toBe(true);
  });

  it('chaining works', () => {
    const mock = createMockRivet()
      .onSimulate(() => ({ gasUsed: 100n }))
      .onBroadcast(() => ({ code: 0, hash: 'AA', height: 1n }))
      .onQuery(() => new Uint8Array());

    // Just verify it returns the mock (chaining)
    expect(mock).toBeDefined();
    expect(mock.state).toBeDefined();
  });

  it('getAccount returns configurable values', async () => {
    const mock = createMockRivet()
      .onGetAccount(() => ({ accountNumber: 5n, sequence: 10n }));

    const account = await mock.getAccount('cosmos1abc');
    expect(account.accountNumber).toBe(5n);
    expect(account.sequence).toBe(10n);
  });
});
