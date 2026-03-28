import { describe, it, expect } from 'vitest';
import type { OfflineDirectSigner, AccountData, DirectSignResponse } from '../src/wallet/types';
import type { SignDoc } from '../src/proto/tx';

/**
 * Compatibility tests: verify that the OfflineDirectSigner interface
 * is structurally compatible with shapes from Keplr, Leap, and interchain-kit.
 */
describe('OfflineDirectSigner compatibility', () => {
  it('accepts Keplr-like signer shape', () => {
    // Keplr's getOfflineSignerAuto returns an object with these methods
    const keplrLike: OfflineDirectSigner = {
      async getAccounts(): Promise<readonly AccountData[]> {
        return [{
          address: 'rebar1abc...',
          algo: 'secp256k1' as const,
          pubkey: new Uint8Array(33),
        }];
      },
      async signDirect(_signerAddress: string, signDoc: SignDoc): Promise<DirectSignResponse> {
        return {
          signed: signDoc,
          signature: new Uint8Array(64),
        };
      },
    };

    // TypeScript compilation proves structural compatibility
    expect(keplrLike.getAccounts).toBeDefined();
    expect(keplrLike.signDirect).toBeDefined();
  });

  it('accepts interchain-kit adapter shape', () => {
    // @interchain-kit adapters expose getOfflineSigner() with this shape
    const adapterLike: OfflineDirectSigner = {
      async getAccounts() {
        return [{
          address: 'rebar1xyz...',
          algo: 'secp256k1' as const,
          pubkey: new Uint8Array(33),
        }] as const;
      },
      async signDirect(_: string, signDoc: SignDoc) {
        return {
          signed: signDoc,
          signature: new Uint8Array(64),
        };
      },
    };

    expect(adapterLike.getAccounts).toBeDefined();
    expect(adapterLike.signDirect).toBeDefined();
  });
});
