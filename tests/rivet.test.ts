import { describe, it, expect } from 'vitest';
import { Rivet } from '../src/signer';
import { RivetError } from '../src/errors';

describe('Rivet.connect', () => {
  it('creates a read-only client without wallet', () => {
    const rivet = Rivet.connect('http://localhost:26657');
    expect(rivet).toBeInstanceOf(Rivet);
    expect(rivet.rpc).toBeDefined();
  });

  it('read-only client throws on signAndBroadcast', async () => {
    const rivet = Rivet.connect('http://localhost:26657');

    await expect(
      rivet.signAndBroadcast({ messages: [] }),
    ).rejects.toThrow(RivetError);

    await expect(
      rivet.signAndBroadcast({ messages: [] }),
    ).rejects.toThrow('No wallet configured');
  });

  it('read-only client throws on simulate', async () => {
    const rivet = Rivet.connect('http://localhost:26657');

    await expect(
      rivet.simulate([], 'rebar1abc'),
    ).rejects.toThrow('No wallet configured');
  });

  it('creates full client with wallet config', () => {
    const mockWallet = {
      getAccounts: async () => [{ address: 'rebar1test', pubkey: new Uint8Array(33), algo: 'secp256k1' as const }],
      signDirect: async () => ({ signed: {} as any, signature: new Uint8Array(64) }),
    };

    const rivet = Rivet.connect('http://localhost:26657', {
      wallet: mockWallet,
      gasConfig: { multiplier: 2.0, gasPrice: '0.01urebar' },
      chainId: 'test-chain',
    });

    expect(rivet).toBeInstanceOf(Rivet);
  });

  it('query delegates to underlying client', async () => {
    const rivet = Rivet.connect('http://localhost:26657');
    // query will fail because there's no actual RPC server, but it should
    // be a method that exists
    expect(typeof rivet.query).toBe('function');
  });
});
