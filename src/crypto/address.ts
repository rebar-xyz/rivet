import { bech32 } from 'bech32';
import { sha256, ripemd160 } from './hash.js';

/**
 * Derive a bech32 address from a compressed secp256k1 public key.
 * Standard Cosmos address: SHA-256(pubkey) -> RIPEMD-160 -> bech32
 */
export function pubkeyToAddress(pubkey: Uint8Array, prefix: string): string {
  const hash = ripemd160(sha256(pubkey));
  const words = bech32.toWords(hash);
  return bech32.encode(prefix, words);
}
