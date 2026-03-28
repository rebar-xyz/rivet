import { HDKey } from '@scure/bip32';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha512 } from '@noble/hashes/sha512';
import { getPublicKey } from '../crypto/secp256k1.js';
import { pubkeyToAddress } from '../crypto/address.js';
import { sha256 } from '../crypto/hash.js';
import { sign } from '../crypto/secp256k1.js';
import { SignDoc } from '../proto/tx.js';
import type { AccountData, DirectSignResponse, OfflineDirectSigner } from './types.js';

const DEFAULT_HD_PATH = "m/44'/118'/0'/0/0";

/**
 * HD wallet from a BIP-39 mnemonic.
 *
 * Derives a secp256k1 key pair using standard Cosmos HD path.
 * Mnemonic -> PBKDF2-SHA512 seed (no wordlist validation) -> BIP32 -> secp256k1.
 *
 * Imported via the separate `@rebarxyz/rivet/wallet` entry point
 * so browser apps using hardware wallets don't pay for @scure/bip32.
 */
export class HDWallet implements OfflineDirectSigner {
  private readonly privateKey: Uint8Array;
  private readonly pubkey: Uint8Array;
  private readonly address: string;

  private constructor(privateKey: Uint8Array, prefix: string) {
    this.privateKey = privateKey;
    this.pubkey = getPublicKey(privateKey);
    this.address = pubkeyToAddress(this.pubkey, prefix);
  }

  static fromMnemonic(
    mnemonic: string,
    options: { prefix: string; hdPath?: string },
  ): HDWallet {
    const hdPath = options.hdPath ?? DEFAULT_HD_PATH;

    // BIP-39 mnemonic to seed: PBKDF2(SHA-512, mnemonic, "mnemonic" + passphrase, 2048, 64)
    const mnemonicNorm = mnemonic.normalize('NFKD');
    const salt = 'mnemonic'; // no passphrase
    const seed = pbkdf2(sha512, mnemonicNorm, salt, { c: 2048, dkLen: 64 });

    // BIP-32 derivation
    const master = HDKey.fromMasterSeed(seed);
    const derived = master.derive(hdPath);

    if (!derived.privateKey) {
      throw new Error('Failed to derive private key from HD path');
    }

    return new HDWallet(derived.privateKey, options.prefix);
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

  /** Returns JSON-safe representation. Private key and mnemonic are never exposed. */
  toJSON(): { address: string; pubkey: string } {
    return {
      address: this.address,
      pubkey: Array.from(this.pubkey).map(b => b.toString(16).padStart(2, '0')).join(''),
    };
  }
}
