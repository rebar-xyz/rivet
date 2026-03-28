import { sign, getPublicKey } from '../crypto/secp256k1.js';
import { sha256 } from '../crypto/hash.js';
import { pubkeyToAddress } from '../crypto/address.js';
import { SignDoc } from '../proto/tx.js';
import type { AccountData, DirectSignResponse, OfflineDirectSigner } from './types.js';

/** Wallet implementation from a raw secp256k1 private key. */
export class Secp256k1Wallet implements OfflineDirectSigner {
  private readonly pubkey: Uint8Array;
  private readonly address: string;

  private constructor(
    private readonly privateKey: Uint8Array,
    prefix: string,
  ) {
    this.pubkey = getPublicKey(privateKey);
    this.address = pubkeyToAddress(this.pubkey, prefix);
  }

  static fromKey(privateKey: Uint8Array, prefix: string): Secp256k1Wallet {
    if (privateKey.length !== 32) {
      throw new Error('Private key must be 32 bytes');
    }
    return new Secp256k1Wallet(privateKey.slice(), prefix);
  }

  async getAccounts(): Promise<readonly AccountData[]> {
    return [{
      address: this.address,
      algo: 'secp256k1',
      pubkey: this.pubkey,
    }];
  }

  async signDirect(signerAddress: string, signDoc: SignDoc): Promise<DirectSignResponse> {
    if (signerAddress !== this.address) {
      throw new Error(`Address mismatch: requested ${signerAddress}, wallet has ${this.address}`);
    }

    const signDocBytes = SignDoc.encode(signDoc);
    const hash = sha256(signDocBytes);
    const signature = sign(hash, this.privateKey);

    return { signed: signDoc, signature };
  }

  /** Returns JSON-safe representation. Private key is never exposed. */
  toJSON(): { address: string; pubkey: string } {
    return {
      address: this.address,
      pubkey: Array.from(this.pubkey).map(b => b.toString(16).padStart(2, '0')).join(''),
    };
  }
}
