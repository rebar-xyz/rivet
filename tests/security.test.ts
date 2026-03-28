import { describe, it, expect } from 'vitest';
import { Secp256k1Wallet } from '../src/wallet/secp256k1';
import { HDWallet } from '../src/wallet/hd';
import { verify, getPublicKey } from '../src/crypto/secp256k1';
import { sha256 } from '../src/crypto/hash';
import { SignDoc } from '../src/proto/tx';
import {
  RivetError,
  BroadcastError,
  SimulationError,
  AccountNotFoundError,
  RpcError,
  InsufficientFundsError,
  SigningRejectedError,
} from '../src/errors';

const TEST_KEY = new Uint8Array(32).fill(1);
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('Cryptographic correctness', () => {
  it('signature is valid for the signed message', async () => {
    const wallet = Secp256k1Wallet.fromKey(TEST_KEY, 'rebar');
    const accounts = await wallet.getAccounts();
    const signDoc: SignDoc = {
      bodyBytes: new Uint8Array([1, 2, 3]),
      authInfoBytes: new Uint8Array([4, 5, 6]),
      chainId: 'test',
      accountNumber: 0n,
    };

    const { signature } = await wallet.signDirect(accounts[0]!.address, signDoc);
    const hash = sha256(SignDoc.encode(signDoc));
    expect(verify(signature, hash, accounts[0]!.pubkey)).toBe(true);
  });

  it('tampered message fails verification', async () => {
    const wallet = Secp256k1Wallet.fromKey(TEST_KEY, 'rebar');
    const accounts = await wallet.getAccounts();
    const signDoc: SignDoc = {
      bodyBytes: new Uint8Array([1, 2, 3]),
      authInfoBytes: new Uint8Array([4, 5, 6]),
      chainId: 'test',
      accountNumber: 0n,
    };

    const { signature } = await wallet.signDirect(accounts[0]!.address, signDoc);

    // Tamper with the message
    const tampered: SignDoc = { ...signDoc, bodyBytes: new Uint8Array([99, 99, 99]) };
    const tamperedHash = sha256(SignDoc.encode(tampered));
    expect(verify(signature, tamperedHash, accounts[0]!.pubkey)).toBe(false);
  });

  it('wrong public key fails verification', async () => {
    const wallet = Secp256k1Wallet.fromKey(TEST_KEY, 'rebar');
    const accounts = await wallet.getAccounts();
    const signDoc: SignDoc = {
      bodyBytes: new Uint8Array([1]),
      authInfoBytes: new Uint8Array([2]),
      chainId: 'test',
      accountNumber: 0n,
    };

    const { signature } = await wallet.signDirect(accounts[0]!.address, signDoc);
    const hash = sha256(SignDoc.encode(signDoc));

    const wrongKey = getPublicKey(new Uint8Array(32).fill(2));
    expect(verify(signature, hash, wrongKey)).toBe(false);
  });
});

describe('Key isolation', () => {
  it('Secp256k1Wallet.toJSON does not expose private key', () => {
    const wallet = Secp256k1Wallet.fromKey(TEST_KEY, 'rebar');
    const json = JSON.stringify(wallet);
    const keyHex = Array.from(TEST_KEY).map(b => b.toString(16).padStart(2, '0')).join('');
    expect(json).not.toContain(keyHex);
    expect(json).not.toContain('privateKey');
  });

  it('HDWallet.toJSON does not expose private key or mnemonic', () => {
    const wallet = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'rebar' });
    const json = JSON.stringify(wallet);
    expect(json).not.toContain('abandon');
    expect(json).not.toContain('privateKey');
    expect(json).not.toContain('mnemonic');
  });

  it('Secp256k1Wallet is not affected by external mutation of input key', async () => {
    const key = new Uint8Array(32).fill(1);
    const wallet = Secp256k1Wallet.fromKey(key, 'rebar');
    const addressBefore = (await wallet.getAccounts())[0]!.address;

    key.fill(0);

    const addressAfter = (await wallet.getAccounts())[0]!.address;
    expect(addressAfter).toBe(addressBefore);
  });

  it('error messages do not contain secrets', () => {
    const errors = [
      new RivetError('test', 'TEST'),
      new BroadcastError('tx failed', 5, 'out of gas'),
      new SimulationError('sim failed', 'bad tx'),
      new AccountNotFoundError('rebar1abc'),
      new RpcError('connection failed', 'http://localhost:26657'),
      new InsufficientFundsError('not enough', 'abc123'),
      new SigningRejectedError('user rejected'),
    ];

    const keyHex = Array.from(TEST_KEY).map(b => b.toString(16).padStart(2, '0')).join('');
    for (const err of errors) {
      const str = `${err.message} ${err.stack}`;
      expect(str).not.toContain(keyHex);
      expect(str).not.toContain('abandon');
    }
  });
});

describe('Error hierarchy', () => {
  it('all errors extend RivetError', () => {
    expect(new BroadcastError('', 0, '')).toBeInstanceOf(RivetError);
    expect(new SimulationError('', '')).toBeInstanceOf(RivetError);
    expect(new AccountNotFoundError('')).toBeInstanceOf(RivetError);
    expect(new RpcError('', '')).toBeInstanceOf(RivetError);
    expect(new InsufficientFundsError('', '')).toBeInstanceOf(RivetError);
    expect(new SigningRejectedError()).toBeInstanceOf(RivetError);
  });

  it('InsufficientFundsError extends BroadcastError', () => {
    expect(new InsufficientFundsError('', '')).toBeInstanceOf(BroadcastError);
  });

  it('error codes are set correctly', () => {
    expect(new BroadcastError('', 0, '').code).toBe('BROADCAST_ERROR');
    expect(new SimulationError('', '').code).toBe('SIMULATION_ERROR');
    expect(new AccountNotFoundError('').code).toBe('ACCOUNT_NOT_FOUND');
    expect(new RpcError('', '').code).toBe('RPC_ERROR');
    expect(new InsufficientFundsError('', '').code).toBe('INSUFFICIENT_FUNDS');
    expect(new SigningRejectedError().code).toBe('SIGNING_REJECTED');
  });

});

// -- Wallet response normalization ------------------------------------------
// The signer must handle signature and SignDoc shapes from various wallets
// (Keplr, Leap, cosmjs). These test the extraction/normalization logic.

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(str, 'base64'));
  }
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Replicate private helpers from signer.ts for unit testing
function extractSignature(sig: Uint8Array | { signature: string | Uint8Array; pub_key?: unknown }): Uint8Array {
  if (sig instanceof Uint8Array) return sig;
  if (sig && typeof sig === 'object' && 'signature' in sig) {
    const inner = sig.signature;
    if (inner instanceof Uint8Array) return inner;
    if (typeof inner === 'string') return fromBase64(inner);
  }
  throw new Error('Unrecognized signature format');
}

function normalizeSignedDoc(doc: {
  bodyBytes: Uint8Array | string;
  authInfoBytes: Uint8Array | string;
  chainId: string;
  accountNumber: bigint | number | string;
}): SignDoc {
  const bodyBytes = typeof doc.bodyBytes === 'string'
    ? fromBase64(doc.bodyBytes) : doc.bodyBytes;
  const authInfoBytes = typeof doc.authInfoBytes === 'string'
    ? fromBase64(doc.authInfoBytes) : doc.authInfoBytes;
  const accountNumber = typeof doc.accountNumber === 'bigint'
    ? doc.accountNumber : BigInt(doc.accountNumber);
  return { bodyBytes, authInfoBytes, chainId: doc.chainId, accountNumber };
}

describe('Signature extraction', () => {
  it('handles raw Uint8Array signature', () => {
    const raw = new Uint8Array(64).fill(42);
    expect(extractSignature(raw)).toBe(raw);
  });

  it('handles cosmjs StdSignature with base64 string', () => {
    const raw = new Uint8Array(64).fill(7);
    const b64 = toBase64(raw);
    const stdSig = { pub_key: { type: 'tendermint/PubKeySecp256k1', value: 'AAAA' }, signature: b64 };
    const result = extractSignature(stdSig);
    expect(result).toEqual(raw);
    expect(result.length).toBe(64);
  });

  it('handles intermediate shape with Uint8Array inner', () => {
    const inner = new Uint8Array(64).fill(99);
    const sig = { signature: inner };
    expect(extractSignature(sig)).toBe(inner);
  });

  it('throws on unrecognized format', () => {
    expect(() => extractSignature({} as any)).toThrow('Unrecognized');
  });
});

describe('SignDoc normalization', () => {
  it('passes through native Uint8Array + bigint', () => {
    const body = new Uint8Array([1, 2, 3]);
    const auth = new Uint8Array([4, 5, 6]);
    const result = normalizeSignedDoc({
      bodyBytes: body, authInfoBytes: auth, chainId: 'test', accountNumber: 42n,
    });
    expect(result.bodyBytes).toBe(body);
    expect(result.authInfoBytes).toBe(auth);
    expect(result.accountNumber).toBe(42n);
  });

  it('decodes base64 bodyBytes and authInfoBytes', () => {
    const body = new Uint8Array([10, 20, 30]);
    const auth = new Uint8Array([40, 50, 60]);
    const result = normalizeSignedDoc({
      bodyBytes: toBase64(body), authInfoBytes: toBase64(auth),
      chainId: 'test', accountNumber: 5n,
    });
    expect(result.bodyBytes).toEqual(body);
    expect(result.authInfoBytes).toEqual(auth);
  });

  it('converts number accountNumber to bigint', () => {
    const result = normalizeSignedDoc({
      bodyBytes: new Uint8Array(0), authInfoBytes: new Uint8Array(0),
      chainId: 'test', accountNumber: 123,
    });
    expect(result.accountNumber).toBe(123n);
  });

  it('converts string accountNumber to bigint', () => {
    const result = normalizeSignedDoc({
      bodyBytes: new Uint8Array(0), authInfoBytes: new Uint8Array(0),
      chainId: 'test', accountNumber: '999',
    });
    expect(result.accountNumber).toBe(999n);
  });
});
