import { secp256k1 } from '@noble/curves/secp256k1';

/** Sign a SHA-256 hash with a secp256k1 private key. Returns 64-byte compact (r||s) signature. */
export function sign(messageHash: Uint8Array, privateKey: Uint8Array): Uint8Array {
  const sig = secp256k1.sign(messageHash, privateKey, { lowS: true });
  return sig.toBytes('compact');
}

/** Verify a 64-byte compact signature against a SHA-256 hash and compressed public key. */
export function verify(signature: Uint8Array, messageHash: Uint8Array, publicKey: Uint8Array): boolean {
  return secp256k1.verify(signature, messageHash, publicKey);
}

/** Derive the compressed (33-byte) public key from a 32-byte private key. */
export function getPublicKey(privateKey: Uint8Array, compressed = true): Uint8Array {
  return secp256k1.getPublicKey(privateKey, compressed);
}
