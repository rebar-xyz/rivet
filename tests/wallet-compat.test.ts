/**
 * Wallet compatibility tests.
 *
 * Tests that the signature extraction and SignDoc normalization functions
 * correctly handle the various response shapes returned by CosmJS, Keplr,
 * Leap, and interchain-kit wallets at runtime.
 *
 * These are unit tests that don't require a chain.
 */

import { describe, it, expect } from 'vitest';
import { extractSignature, normalizeSignedDoc } from '../src/signer';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { fromBase64, toBase64 } from '@cosmjs/encoding';
import Long from 'long';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('extractSignature: handles CosmJS/Keplr response shapes', () => {
  const rawSig = new Uint8Array(64).fill(0xab);

  it('handles raw Uint8Array (rivet native)', () => {
    const result = extractSignature(rawSig);
    expect(result).toEqual(rawSig);
  });

  it('handles StdSignature with base64 string (Keplr format)', () => {
    // Keplr returns { signature: base64String, pub_key: {...} }
    const keplrStyle = {
      signature: toBase64(rawSig),
      pub_key: { type: 'tendermint/PubKeySecp256k1', value: 'some-base64-pubkey' },
    };
    const result = extractSignature(keplrStyle);
    expect(result).toEqual(rawSig);
  });

  it('handles StdSignature with Uint8Array (cosmjs variant)', () => {
    // Some cosmjs code paths return { signature: Uint8Array }
    const cosmjsStyle = {
      signature: rawSig,
      pub_key: { type: 'tendermint/PubKeySecp256k1', value: 'some-base64-pubkey' },
    };
    const result = extractSignature(cosmjsStyle);
    expect(result).toEqual(rawSig);
  });

  it('handles signature without pub_key field', () => {
    const noPubKey = { signature: toBase64(rawSig) };
    const result = extractSignature(noPubKey);
    expect(result).toEqual(rawSig);
  });

  it('throws on unrecognized format', () => {
    expect(() => extractSignature({ wrong: 'shape' } as any)).toThrow('Unrecognized signature format');
    expect(() => extractSignature(null as any)).toThrow();
  });
});

describe('normalizeSignedDoc: handles CosmJS/Keplr response shapes', () => {
  const bodyBytes = new Uint8Array([1, 2, 3]);
  const authInfoBytes = new Uint8Array([4, 5, 6]);
  const chainId = 'test-chain-1';

  it('handles Uint8Array + bigint (rivet native)', () => {
    const doc = { bodyBytes, authInfoBytes, chainId, accountNumber: 42n };
    const result = normalizeSignedDoc(doc);
    expect(result.bodyBytes).toEqual(bodyBytes);
    expect(result.authInfoBytes).toEqual(authInfoBytes);
    expect(result.chainId).toBe(chainId);
    expect(result.accountNumber).toBe(42n);
  });

  it('handles base64 strings for bytes (Keplr format)', () => {
    const doc = {
      bodyBytes: toBase64(bodyBytes),
      authInfoBytes: toBase64(authInfoBytes),
      chainId,
      accountNumber: 42n,
    };
    const result = normalizeSignedDoc(doc);
    expect(result.bodyBytes).toEqual(bodyBytes);
    expect(result.authInfoBytes).toEqual(authInfoBytes);
  });

  it('handles number for accountNumber (some wallets)', () => {
    const doc = { bodyBytes, authInfoBytes, chainId, accountNumber: 42 };
    const result = normalizeSignedDoc(doc);
    expect(result.accountNumber).toBe(42n);
  });

  it('handles string for accountNumber', () => {
    const doc = { bodyBytes, authInfoBytes, chainId, accountNumber: '12345' };
    const result = normalizeSignedDoc(doc);
    expect(result.accountNumber).toBe(12345n);
  });

  it('handles cosmjs Long for accountNumber', () => {
    // cosmjs uses Long from the 'long' package
    const longValue = Long.fromNumber(999);
    const doc = { bodyBytes, authInfoBytes, chainId, accountNumber: longValue };
    const result = normalizeSignedDoc(doc);
    // Long.toString() returns the string representation
    expect(result.accountNumber).toBe(999n);
  });

  it('handles mixed: base64 bytes + Long accountNumber (worst case Keplr)', () => {
    const doc = {
      bodyBytes: toBase64(bodyBytes),
      authInfoBytes: toBase64(authInfoBytes),
      chainId,
      accountNumber: Long.fromNumber(777),
    };
    const result = normalizeSignedDoc(doc);
    expect(result.bodyBytes).toEqual(bodyBytes);
    expect(result.authInfoBytes).toEqual(authInfoBytes);
    expect(result.accountNumber).toBe(777n);
  });
});

describe('CosmJS DirectSecp256k1HdWallet integration', () => {
  it('signDirect response can be normalized', async () => {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'rebar' });
    const accounts = await wallet.getAccounts();
    const address = accounts[0]!.address;

    // Create a SignDoc that cosmjs will sign
    const signDoc = {
      bodyBytes: new Uint8Array([1, 2, 3]),
      authInfoBytes: new Uint8Array([4, 5, 6]),
      chainId: 'rebar-test-1',
      accountNumber: Long.fromNumber(42), // cosmjs uses Long
    };

    const response = await wallet.signDirect(address, signDoc);

    // The response should be normalizable
    const normalizedDoc = normalizeSignedDoc(response.signed);
    expect(normalizedDoc.bodyBytes).toEqual(signDoc.bodyBytes);
    expect(normalizedDoc.authInfoBytes).toEqual(signDoc.authInfoBytes);
    expect(normalizedDoc.chainId).toBe('rebar-test-1');
    expect(normalizedDoc.accountNumber).toBe(42n);

    // The signature should be extractable
    const signature = extractSignature(response.signature);
    expect(signature.length).toBe(64);
    expect(signature).toBeInstanceOf(Uint8Array);
  });

  it('handles cosmjs signature response format', async () => {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'cosmos' });
    const accounts = await wallet.getAccounts();
    const address = accounts[0]!.address;

    const signDoc = {
      bodyBytes: new Uint8Array([0xaa, 0xbb]),
      authInfoBytes: new Uint8Array([0xcc, 0xdd]),
      chainId: 'cosmoshub-4',
      accountNumber: Long.fromNumber(100),
    };

    const response = await wallet.signDirect(address, signDoc);

    // cosmjs returns signature as StdSignature { signature: base64, pub_key: {...} }
    // Verify our extractor handles it
    const signature = extractSignature(response.signature);
    expect(signature.length).toBe(64);

    // Verify the signature is valid bytes (not still base64)
    expect(signature.every(b => typeof b === 'number' && b >= 0 && b <= 255)).toBe(true);
  });
});
