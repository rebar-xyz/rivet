import { describe, it, expect } from 'vitest';
import { Secp256k1Wallet } from '../src/wallet/secp256k1';
import { HDWallet } from '../src/wallet/hd';
import { verify, getPublicKey } from '../src/crypto/secp256k1';
import { sha256 } from '../src/crypto/hash';
import { pubkeyToAddress } from '../src/crypto/address';
import { SignDoc } from '../src/proto/tx';

// Known test key (32 bytes, all 1s — not for production)
const TEST_PRIVATE_KEY = new Uint8Array(32).fill(1);

describe('Secp256k1Wallet', () => {
  it('creates wallet from private key', async () => {
    const wallet = Secp256k1Wallet.fromKey(TEST_PRIVATE_KEY, 'rebar');
    const accounts = await wallet.getAccounts();
    expect(accounts.length).toBe(1);
    expect(accounts[0]!.algo).toBe('secp256k1');
    expect(accounts[0]!.address.startsWith('rebar')).toBe(true);
    expect(accounts[0]!.pubkey.length).toBe(33); // compressed
  });

  it('rejects non-32-byte key', () => {
    expect(() => Secp256k1Wallet.fromKey(new Uint8Array(16), 'rebar')).toThrow('32 bytes');
  });

  it('signs a SignDoc and produces valid signature', async () => {
    const wallet = Secp256k1Wallet.fromKey(TEST_PRIVATE_KEY, 'rebar');
    const accounts = await wallet.getAccounts();
    const address = accounts[0]!.address;

    const signDoc: SignDoc = {
      bodyBytes: new Uint8Array([1, 2, 3]),
      authInfoBytes: new Uint8Array([4, 5, 6]),
      chainId: 'test-chain',
      accountNumber: 0n,
    };

    const response = await wallet.signDirect(address, signDoc);
    expect(response.signature.length).toBe(64);

    // Verify the signature
    const signDocBytes = SignDoc.encode(signDoc);
    const hash = sha256(signDocBytes);
    const pubkey = getPublicKey(TEST_PRIVATE_KEY);
    expect(verify(response.signature, hash, pubkey)).toBe(true);
  });

  it('rejects signing for wrong address', async () => {
    const wallet = Secp256k1Wallet.fromKey(TEST_PRIVATE_KEY, 'rebar');
    const signDoc: SignDoc = {
      bodyBytes: new Uint8Array(0),
      authInfoBytes: new Uint8Array(0),
      chainId: 'test',
      accountNumber: 0n,
    };

    await expect(wallet.signDirect('rebar1wrong', signDoc)).rejects.toThrow('Address mismatch');
  });

  it('deterministic signing: same input produces same signature', async () => {
    const wallet = Secp256k1Wallet.fromKey(TEST_PRIVATE_KEY, 'rebar');
    const accounts = await wallet.getAccounts();
    const address = accounts[0]!.address;

    const signDoc: SignDoc = {
      bodyBytes: new Uint8Array([1]),
      authInfoBytes: new Uint8Array([2]),
      chainId: 'test',
      accountNumber: 1n,
    };

    const sig1 = await wallet.signDirect(address, signDoc);
    const sig2 = await wallet.signDirect(address, signDoc);
    expect(sig1.signature).toEqual(sig2.signature);
  });

  it('different messages produce different signatures', async () => {
    const wallet = Secp256k1Wallet.fromKey(TEST_PRIVATE_KEY, 'rebar');
    const accounts = await wallet.getAccounts();
    const address = accounts[0]!.address;

    const doc1: SignDoc = {
      bodyBytes: new Uint8Array([1]),
      authInfoBytes: new Uint8Array([2]),
      chainId: 'test',
      accountNumber: 1n,
    };
    const doc2: SignDoc = {
      bodyBytes: new Uint8Array([3]),
      authInfoBytes: new Uint8Array([4]),
      chainId: 'test',
      accountNumber: 1n,
    };

    const sig1 = await wallet.signDirect(address, doc1);
    const sig2 = await wallet.signDirect(address, doc2);
    expect(sig1.signature).not.toEqual(sig2.signature);
  });
});

describe('HDWallet', () => {
  // BIP-39 test mnemonic (well-known, do not use for real funds)
  const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('creates wallet from mnemonic', async () => {
    const wallet = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'rebar' });
    const accounts = await wallet.getAccounts();
    expect(accounts.length).toBe(1);
    expect(accounts[0]!.address.startsWith('rebar')).toBe(true);
    expect(accounts[0]!.algo).toBe('secp256k1');
    expect(accounts[0]!.pubkey.length).toBe(33);
  });

  it('derives consistent address from same mnemonic', async () => {
    const wallet1 = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'rebar' });
    const wallet2 = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'rebar' });
    const addr1 = (await wallet1.getAccounts())[0]!.address;
    const addr2 = (await wallet2.getAccounts())[0]!.address;
    expect(addr1).toBe(addr2);
  });

  it('different HD path produces different address', async () => {
    const wallet1 = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'rebar' });
    const wallet2 = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'rebar', hdPath: "m/44'/118'/0'/0/1" });
    const addr1 = (await wallet1.getAccounts())[0]!.address;
    const addr2 = (await wallet2.getAccounts())[0]!.address;
    expect(addr1).not.toBe(addr2);
  });

  it('different prefix produces different address', async () => {
    const wallet1 = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'rebar' });
    const wallet2 = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'cosmos' });
    const addr1 = (await wallet1.getAccounts())[0]!.address;
    const addr2 = (await wallet2.getAccounts())[0]!.address;
    expect(addr1).not.toBe(addr2);
    expect(addr1.startsWith('rebar')).toBe(true);
    expect(addr2.startsWith('cosmos')).toBe(true);
  });

  it('signs and produces valid signature', async () => {
    const wallet = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'rebar' });
    const accounts = await wallet.getAccounts();
    const address = accounts[0]!.address;
    const pubkey = accounts[0]!.pubkey;

    const signDoc: SignDoc = {
      bodyBytes: new Uint8Array([10, 20]),
      authInfoBytes: new Uint8Array([30, 40]),
      chainId: 'rebar-test',
      accountNumber: 5n,
    };

    const response = await wallet.signDirect(address, signDoc);
    const signDocBytes = SignDoc.encode(signDoc);
    const hash = sha256(signDocBytes);
    expect(verify(response.signature, hash, pubkey)).toBe(true);
  });
});

describe('Address derivation', () => {
  it('pubkeyToAddress produces valid bech32', () => {
    const pubkey = getPublicKey(TEST_PRIVATE_KEY);
    const addr = pubkeyToAddress(pubkey, 'rebar');
    expect(addr.startsWith('rebar1')).toBe(true);
    // Bech32 addresses are typically 39-45 chars
    expect(addr.length).toBeGreaterThan(30);
    expect(addr.length).toBeLessThan(50);
  });

  it('same key produces same address', () => {
    const pubkey = getPublicKey(TEST_PRIVATE_KEY);
    const addr1 = pubkeyToAddress(pubkey, 'rebar');
    const addr2 = pubkeyToAddress(pubkey, 'rebar');
    expect(addr1).toBe(addr2);
  });
});
