import type { SignDoc } from '../proto/tx.js';

export interface AccountData {
  address: string;
  algo: 'secp256k1';
  pubkey: Uint8Array;
}

export interface DirectSignResponse {
  signed: SignDoc;
  signature: Uint8Array;
}

/**
 * Structural interface for offline direct signing.
 *
 * Compatible with Keplr's getOfflineSignerAuto(), Leap's equivalent,
 * and @interchain-kit adapter's getOfflineSigner(). TypeScript structural
 * typing means any object with matching method signatures satisfies this
 * interface without importing it.
 */
export interface OfflineDirectSigner {
  getAccounts(): Promise<readonly AccountData[]>;
  signDirect(signerAddress: string, signDoc: SignDoc): Promise<DirectSignResponse>;
}
