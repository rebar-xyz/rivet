/**
 * Cross-validation test suite.
 *
 * Compares our implementations against cosmjs — the canonical Cosmos SDK
 * JavaScript library — to verify encoding, signing, and address derivation
 * produce identical results. Includes fuzz tests with randomized inputs.
 */

import { describe, it, expect } from 'vitest';

// Our implementations
import { Coin as OurCoin } from '../src/proto/coin';
import { Any as OurAny } from '../src/proto/any';
import { PubKey as OurPubKey } from '../src/proto/keys';
import { TxBody as OurTxBody, AuthInfo as OurAuthInfo, SignDoc as OurSignDoc, TxRaw as OurTxRaw, SignMode } from '../src/proto/tx';
import { TxMsgData as OurTxMsgData } from '../src/proto/abci';
import { sign, verify, getPublicKey } from '../src/crypto/secp256k1';
import { sha256 as ourSha256, ripemd160 as ourRipemd160 } from '../src/crypto/hash';
import { pubkeyToAddress as ourPubkeyToAddress } from '../src/crypto/address';
import { Secp256k1Wallet } from '../src/wallet/secp256k1';
import { HDWallet } from '../src/wallet/hd';
import { buildTxBody, buildAuthInfo, buildSignDoc } from '../src/tx/build';
import { encodeTxRaw } from '../src/tx/encode';
import { calculateFee } from '../src/tx/fee';

// cosmjs-types (canonical protobuf implementations)
import { Coin as CjCoin } from 'cosmjs-types/cosmos/base/v1beta1/coin';
import { Any as CjAny } from 'cosmjs-types/google/protobuf/any';
import { PubKey as CjPubKey } from 'cosmjs-types/cosmos/crypto/secp256k1/keys';
import {
  TxBody as CjTxBody,
  AuthInfo as CjAuthInfo,
  SignDoc as CjSignDoc,
  TxRaw as CjTxRaw,
  Fee as CjFee,
  SignerInfo as CjSignerInfo,
  ModeInfo as CjModeInfo,
} from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { TxMsgData as CjTxMsgData } from 'cosmjs-types/cosmos/base/abci/v1beta1/abci';
import { SignMode as CjSignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { Timestamp as CjTimestamp } from 'cosmjs-types/google/protobuf/timestamp';

// cosmjs crypto & encoding
import { sha256 as cjSha256, ripemd160 as cjRipemd160, Secp256k1 } from '@cosmjs/crypto';
import { toHex, fromBase64, fromHex, toBech32 } from '@cosmjs/encoding';
import { rawSecp256k1PubkeyToRawAddress } from '@cosmjs/amino';

// cosmjs signing
import { DirectSecp256k1HdWallet, makeSignDoc, makeSignBytes, makeAuthInfoBytes, encodePubkey } from '@cosmjs/proto-signing';
import { makeCosmoshubPath } from '@cosmjs/amino';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomBytes(len: number): Uint8Array {
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

function randomString(maxLen: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-_./';
  const len = 1 + Math.floor(Math.random() * maxLen);
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function dateToTimestamp(date: Date): { seconds: bigint; nanos: number } {
  const ms = date.getTime();
  return {
    seconds: BigInt(Math.floor(ms / 1000)),
    nanos: (ms % 1000) * 1_000_000,
  };
}

function randomFutureDate(): Date {
  // Random date 1-120 minutes in the future
  const now = Date.now();
  const futureMs = now + (1 + Math.floor(Math.random() * 120)) * 60 * 1000;
  return new Date(futureMs);
}

// ─── 1. Address Derivation ──────────────────────────────────────────────────

describe('Address derivation: ours vs cosmjs', () => {
  const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('produces identical address from the same mnemonic', async () => {
    // Our implementation
    const ourWallet = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'cosmos' });
    const ourAccounts = await ourWallet.getAccounts();

    // cosmjs
    const cjWallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, {
      hdPaths: [makeCosmoshubPath(0)],
      prefix: 'cosmos',
    });
    const cjAccounts = await cjWallet.getAccounts();

    expect(ourAccounts[0]!.address).toBe(cjAccounts[0]!.address);
  });

  it('produces identical public key from the same mnemonic', async () => {
    const ourWallet = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'cosmos' });
    const ourAccounts = await ourWallet.getAccounts();

    const cjWallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, {
      hdPaths: [makeCosmoshubPath(0)],
      prefix: 'cosmos',
    });
    const cjAccounts = await cjWallet.getAccounts();

    expect(hex(ourAccounts[0]!.pubkey)).toBe(toHex(cjAccounts[0]!.pubkey));
  });

  it('produces identical address with different prefix', async () => {
    const ourWallet = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'rebar' });
    const ourAccounts = await ourWallet.getAccounts();

    const cjWallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, {
      hdPaths: [makeCosmoshubPath(0)],
      prefix: 'rebar',
    });
    const cjAccounts = await cjWallet.getAccounts();

    expect(ourAccounts[0]!.address).toBe(cjAccounts[0]!.address);
  });

  it('produces identical address with non-default HD path', async () => {
    const ourWallet = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'cosmos', hdPath: "m/44'/118'/0'/0/1" });
    const ourAccounts = await ourWallet.getAccounts();

    const cjWallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, {
      hdPaths: [makeCosmoshubPath(1)],
      prefix: 'cosmos',
    });
    const cjAccounts = await cjWallet.getAccounts();

    expect(ourAccounts[0]!.address).toBe(cjAccounts[0]!.address);
  });
});

// ─── 2. Crypto Primitives ───────────────────────────────────────────────────

describe('Crypto primitives: ours vs cosmjs', () => {
  it('SHA-256 produces identical output', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    expect(hex(ourSha256(data))).toBe(toHex(cjSha256(data)));
  });

  it('RIPEMD-160 produces identical output', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    expect(hex(ourRipemd160(data))).toBe(toHex(cjRipemd160(data)));
  });

  it('SHA-256 → RIPEMD-160 chain matches for address derivation', () => {
    const pubkey = new Uint8Array(33).fill(0x02);
    const ourHash = ourRipemd160(ourSha256(pubkey));
    const cjHash = rawSecp256k1PubkeyToRawAddress(pubkey);
    expect(hex(ourHash)).toBe(toHex(cjHash));
  });

  it('secp256k1 pubkey derivation matches', async () => {
    const privkey = new Uint8Array(32).fill(1);
    const ourPubkey = getPublicKey(privkey);
    const cjKeypair = await Secp256k1.makeKeypair(privkey);
    const cjPubkey = Secp256k1.compressPubkey(cjKeypair.pubkey);
    expect(hex(ourPubkey)).toBe(toHex(cjPubkey));
  });

  it('full address pipeline matches: privkey → pubkey → SHA256 → RIPEMD160 → bech32', async () => {
    const privkey = new Uint8Array(32).fill(1);

    // Ours
    const ourPubkey = getPublicKey(privkey);
    const ourAddr = ourPubkeyToAddress(ourPubkey, 'cosmos');

    // cosmjs step-by-step
    const cjKeypair = await Secp256k1.makeKeypair(privkey);
    const cjPubkey = Secp256k1.compressPubkey(cjKeypair.pubkey);
    const cjRawAddr = rawSecp256k1PubkeyToRawAddress(cjPubkey);
    const cjAddr = toBech32('cosmos', cjRawAddr);

    expect(ourAddr).toBe(cjAddr);
  });

  it('fuzz: SHA-256 matches for 50 random inputs', () => {
    for (let i = 0; i < 50; i++) {
      const data = randomBytes(1 + Math.floor(Math.random() * 200));
      expect(hex(ourSha256(data))).toBe(toHex(cjSha256(data)));
    }
  });

  it('fuzz: RIPEMD-160 matches for 50 random inputs', () => {
    for (let i = 0; i < 50; i++) {
      const data = randomBytes(1 + Math.floor(Math.random() * 200));
      expect(hex(ourRipemd160(data))).toBe(toHex(cjRipemd160(data)));
    }
  });
});

// ─── 3. Proto Encoding: Coin ────────────────────────────────────────────────

describe('Proto encoding: Coin — ours vs cosmjs-types', () => {
  function compareCoin(denom: string, amount: string) {
    const ours = OurCoin.encode({ denom, amount });
    const theirs = CjCoin.encode({ denom, amount }).finish();
    expect(hex(ours)).toBe(toHex(theirs));
  }

  it('matches for typical coin', () => {
    compareCoin('uatom', '1000');
  });

  it('matches for large amount', () => {
    compareCoin('urebar', '999999999999');
  });

  it('matches for empty denom/amount', () => {
    compareCoin('', '');
  });

  it('fuzz: matches for 50 random coins', () => {
    for (let i = 0; i < 50; i++) {
      const denom = randomString(10);
      const amount = String(Math.floor(Math.random() * 1e15));
      compareCoin(denom, amount);
    }
  });
});

// ─── 4. Proto Encoding: Any ─────────────────────────────────────────────────

describe('Proto encoding: Any — ours vs cosmjs-types', () => {
  function compareAny(typeUrl: string, value: Uint8Array) {
    const ours = OurAny.encode({ typeUrl, value });
    const theirs = CjAny.encode({ typeUrl, value }).finish();
    expect(hex(ours)).toBe(toHex(theirs));
  }

  it('matches for typical message', () => {
    compareAny('/cosmos.bank.v1beta1.MsgSend', new Uint8Array([0xde, 0xad]));
  });

  it('matches for empty value', () => {
    compareAny('/test.Empty', new Uint8Array(0));
  });

  it('fuzz: matches for 50 random Any values', () => {
    for (let i = 0; i < 50; i++) {
      const typeUrl = '/' + randomString(30);
      const value = randomBytes(Math.floor(Math.random() * 100));
      compareAny(typeUrl, value);
    }
  });
});

// ─── 5. Proto Encoding: PubKey ──────────────────────────────────────────────

describe('Proto encoding: PubKey — ours vs cosmjs-types', () => {
  it('matches for 33-byte compressed key', () => {
    const key = new Uint8Array(33).fill(0x02);
    const ours = OurPubKey.encode({ key });
    const theirs = CjPubKey.encode({ key }).finish();
    expect(hex(ours)).toBe(toHex(theirs));
  });

  it('matches for real derived key', () => {
    const key = getPublicKey(new Uint8Array(32).fill(1));
    const ours = OurPubKey.encode({ key });
    const theirs = CjPubKey.encode({ key }).finish();
    expect(hex(ours)).toBe(toHex(theirs));
  });
});

// ─── 6. Proto Encoding: SignDoc ─────────────────────────────────────────────

describe('Proto encoding: SignDoc — ours vs cosmjs-types', () => {
  it('matches for typical SignDoc', () => {
    const bodyBytes = new Uint8Array([1, 2, 3]);
    const authInfoBytes = new Uint8Array([4, 5, 6]);
    const chainId = 'test-1';
    const accountNumber = 42n;

    const ours = OurSignDoc.encode({ bodyBytes, authInfoBytes, chainId, accountNumber });
    const theirs = CjSignDoc.encode({
      bodyBytes, authInfoBytes, chainId, accountNumber: BigInt(accountNumber),
    }).finish();

    expect(hex(ours)).toBe(toHex(theirs));
  });

  it('matches for zero accountNumber', () => {
    const ours = OurSignDoc.encode({
      bodyBytes: new Uint8Array([0xaa]),
      authInfoBytes: new Uint8Array([0xbb]),
      chainId: 'chain',
      accountNumber: 0n,
    });
    const theirs = CjSignDoc.encode({
      bodyBytes: new Uint8Array([0xaa]),
      authInfoBytes: new Uint8Array([0xbb]),
      chainId: 'chain',
      accountNumber: 0n,
    }).finish();

    expect(hex(ours)).toBe(toHex(theirs));
  });

  it('fuzz: matches for 30 random SignDocs', () => {
    for (let i = 0; i < 30; i++) {
      const bodyBytes = randomBytes(1 + Math.floor(Math.random() * 50));
      const authInfoBytes = randomBytes(1 + Math.floor(Math.random() * 50));
      const chainId = randomString(10);
      const accountNumber = BigInt(Math.floor(Math.random() * 1e9));

      const ours = OurSignDoc.encode({ bodyBytes, authInfoBytes, chainId, accountNumber });
      const theirs = CjSignDoc.encode({ bodyBytes, authInfoBytes, chainId, accountNumber }).finish();

      expect(hex(ours)).toBe(toHex(theirs));
    }
  });
});

// ─── 7. Proto Encoding: TxRaw ──────────────────────────────────────────────

describe('Proto encoding: TxRaw — ours vs cosmjs-types', () => {
  it('matches for typical TxRaw', () => {
    const bodyBytes = new Uint8Array([0xaa]);
    const authInfoBytes = new Uint8Array([0xbb]);
    const signatures = [new Uint8Array([0xcc, 0xdd])];

    const ours = OurTxRaw.encode({ bodyBytes, authInfoBytes, signatures });
    const theirs = CjTxRaw.encode({ bodyBytes, authInfoBytes, signatures }).finish();

    expect(hex(ours)).toBe(toHex(theirs));
  });

  it('matches with multiple signatures', () => {
    const bodyBytes = randomBytes(20);
    const authInfoBytes = randomBytes(20);
    const signatures = [randomBytes(64), randomBytes(64)];

    const ours = OurTxRaw.encode({ bodyBytes, authInfoBytes, signatures });
    const theirs = CjTxRaw.encode({ bodyBytes, authInfoBytes, signatures }).finish();

    expect(hex(ours)).toBe(toHex(theirs));
  });

  it('fuzz: matches for 30 random TxRaw values', () => {
    for (let i = 0; i < 30; i++) {
      const bodyBytes = randomBytes(1 + Math.floor(Math.random() * 100));
      const authInfoBytes = randomBytes(1 + Math.floor(Math.random() * 100));
      const numSigs = 1 + Math.floor(Math.random() * 3);
      const signatures = Array.from({ length: numSigs }, () => randomBytes(64));

      const ours = OurTxRaw.encode({ bodyBytes, authInfoBytes, signatures });
      const theirs = CjTxRaw.encode({ bodyBytes, authInfoBytes, signatures }).finish();

      expect(hex(ours)).toBe(toHex(theirs));
    }
  });
});

// ─── 8. Proto Encoding: TxBody ──────────────────────────────────────────────

describe('Proto encoding: TxBody — ours vs cosmjs-types', () => {
  it('matches for body with one message', () => {
    const messages = [{ typeUrl: '/test.Msg', value: new Uint8Array([0xab]) }];

    const ours = OurTxBody.encode(OurTxBody.fromPartial({ messages }));
    const theirs = CjTxBody.encode({
      messages, memo: '', timeoutHeight: 0n,
      extensionOptions: [], nonCriticalExtensionOptions: [],
      unordered: false,
    }).finish();

    expect(hex(ours)).toBe(toHex(theirs));
  });

  it('matches for body with memo and timeoutHeight', () => {
    const messages = [{ typeUrl: '/rebar.rebar.MsgAddData', value: new Uint8Array([1, 2, 3]) }];

    const ours = OurTxBody.encode(OurTxBody.fromPartial({
      messages, memo: 'test memo', timeoutHeight: 100n,
    }));
    const theirs = CjTxBody.encode({
      messages, memo: 'test memo', timeoutHeight: 100n,
      extensionOptions: [], nonCriticalExtensionOptions: [],
      unordered: false,
    }).finish();

    expect(hex(ours)).toBe(toHex(theirs));
  });

  it('matches for body with multiple messages', () => {
    const messages = [
      { typeUrl: '/msg.A', value: new Uint8Array([1]) },
      { typeUrl: '/msg.B', value: new Uint8Array([2, 3]) },
      { typeUrl: '/msg.C', value: new Uint8Array([4, 5, 6]) },
    ];

    const ours = OurTxBody.encode(OurTxBody.fromPartial({ messages }));
    const theirs = CjTxBody.encode({
      messages, memo: '', timeoutHeight: 0n,
      extensionOptions: [], nonCriticalExtensionOptions: [],
      unordered: false,
    }).finish();

    expect(hex(ours)).toBe(toHex(theirs));
  });

  it('fuzz: matches for 30 random TxBodies', () => {
    for (let i = 0; i < 30; i++) {
      const numMsgs = 1 + Math.floor(Math.random() * 4);
      const messages = Array.from({ length: numMsgs }, () => ({
        typeUrl: '/' + randomString(20),
        value: randomBytes(Math.floor(Math.random() * 50)),
      }));
      const memo = Math.random() > 0.5 ? randomString(20) : '';
      const timeoutHeight = Math.random() > 0.5 ? BigInt(Math.floor(Math.random() * 1e6)) : 0n;

      const ours = OurTxBody.encode(OurTxBody.fromPartial({ messages, memo, timeoutHeight }));
      const theirs = CjTxBody.encode({
        messages, memo, timeoutHeight,
        extensionOptions: [], nonCriticalExtensionOptions: [],
        unordered: false,
      }).finish();

      expect(hex(ours)).toBe(toHex(theirs));
    }
  });

  it('matches for unordered=true with timeoutTimestamp', () => {
    const messages = [{ typeUrl: '/test.Msg', value: new Uint8Array([0xab]) }];
    const timestamp = new Date('2025-06-15T12:30:45.123Z');

    const ours = OurTxBody.encode(OurTxBody.fromPartial({
      messages,
      unordered: true,
      timeoutTimestamp: timestamp,
    }));
    const theirs = CjTxBody.encode({
      messages, memo: '', timeoutHeight: 0n,
      extensionOptions: [], nonCriticalExtensionOptions: [],
      unordered: true,
      timeoutTimestamp: dateToTimestamp(timestamp),
    }).finish();

    expect(hex(ours)).toBe(toHex(theirs));
  });

  it('unordered TxBody decode interop works both directions', () => {
    const messages = [{ typeUrl: '/test.Msg', value: new Uint8Array([1, 2]) }];
    const timestamp = new Date('2025-03-15T10:30:00.250Z');

    // cosmjs encode → rivet decode
    const cjEncoded = CjTxBody.encode({
      messages, memo: 'test', timeoutHeight: 0n,
      extensionOptions: [], nonCriticalExtensionOptions: [],
      unordered: true,
      timeoutTimestamp: dateToTimestamp(timestamp),
    }).finish();
    const ourDecoded = OurTxBody.decode(cjEncoded);
    expect(ourDecoded.unordered).toBe(true);
    expect(ourDecoded.timeoutTimestamp!.getTime()).toBe(timestamp.getTime());

    // rivet encode → cosmjs decode
    const ourEncoded = OurTxBody.encode(OurTxBody.fromPartial({
      messages, memo: 'test', unordered: true, timeoutTimestamp: timestamp,
    }));
    const cjDecoded = CjTxBody.decode(ourEncoded);
    expect(cjDecoded.unordered).toBe(true);
    const decodedTs = cjDecoded.timeoutTimestamp!;
    expect(Number(decodedTs.seconds) * 1000 + Math.floor(decodedTs.nanos / 1_000_000)).toBe(timestamp.getTime());
  });

  it('fuzz: unordered TxBodies with timestamps match across implementations', () => {
    for (let i = 0; i < 10; i++) {
      const messages = [{ typeUrl: '/' + randomString(15), value: randomBytes(20) }];
      const timestamp = randomFutureDate();

      const ours = OurTxBody.encode(OurTxBody.fromPartial({
        messages, unordered: true, timeoutTimestamp: timestamp,
      }));
      const theirs = CjTxBody.encode({
        messages, memo: '', timeoutHeight: 0n,
        extensionOptions: [], nonCriticalExtensionOptions: [],
        unordered: true,
        timeoutTimestamp: dateToTimestamp(timestamp),
      }).finish();

      expect(hex(ours)).toBe(toHex(theirs));
    }
  });
});

// ─── 9. Proto Encoding: AuthInfo ────────────────────────────────────────────

describe('Proto encoding: AuthInfo — ours vs cosmjs-types', () => {
  it('matches for typical single-signer AuthInfo', () => {
    const pubkeyBytes = new Uint8Array(33).fill(0x02);
    const encodedPubKey = OurPubKey.encode({ key: pubkeyBytes });

    const ours = OurAuthInfo.encode({
      signerInfos: [{
        publicKey: { typeUrl: '/cosmos.crypto.secp256k1.PubKey', value: encodedPubKey },
        modeInfo: { single: { mode: SignMode.DIRECT } },
        sequence: 7n,
      }],
      fee: {
        amount: [{ denom: 'urebar', amount: '5000' }],
        gasLimit: 200000n,
      },
    });

    const theirs = CjAuthInfo.encode({
      signerInfos: [{
        publicKey: {
          typeUrl: '/cosmos.crypto.secp256k1.PubKey',
          value: CjPubKey.encode({ key: pubkeyBytes }).finish(),
        },
        modeInfo: { single: { mode: CjSignMode.SIGN_MODE_DIRECT } },
        sequence: 7n,
      }],
      fee: {
        amount: [{ denom: 'urebar', amount: '5000' }],
        gasLimit: 200000n,
        payer: '',
        granter: '',
      },
    }).finish();

    expect(hex(ours)).toBe(toHex(theirs));
  });

  it('matches for sequence=0 (new account)', () => {
    const pubkeyBytes = getPublicKey(new Uint8Array(32).fill(1));
    const encodedPubKey = OurPubKey.encode({ key: pubkeyBytes });

    const ours = OurAuthInfo.encode({
      signerInfos: [{
        publicKey: { typeUrl: '/cosmos.crypto.secp256k1.PubKey', value: encodedPubKey },
        modeInfo: { single: { mode: SignMode.DIRECT } },
        sequence: 0n,
      }],
      fee: {
        amount: [{ denom: 'urebar', amount: '1000' }],
        gasLimit: 100000n,
      },
    });

    const theirs = CjAuthInfo.encode({
      signerInfos: [{
        publicKey: {
          typeUrl: '/cosmos.crypto.secp256k1.PubKey',
          value: CjPubKey.encode({ key: pubkeyBytes }).finish(),
        },
        modeInfo: { single: { mode: CjSignMode.SIGN_MODE_DIRECT } },
        sequence: 0n,
      }],
      fee: {
        amount: [{ denom: 'urebar', amount: '1000' }],
        gasLimit: 100000n,
        payer: '',
        granter: '',
      },
    }).finish();

    expect(hex(ours)).toBe(toHex(theirs));
  });
});

// ─── 10. Proto Encoding: TxMsgData ──────────────────────────────────────────

describe('Proto encoding: TxMsgData — ours vs cosmjs-types', () => {
  it('matches for single response', () => {
    const msgResponses = [
      { typeUrl: '/rebar.rebar.MsgAddDataResponse', value: new Uint8Array([0x01, 0x02]) },
    ];

    const ours = OurTxMsgData.encode({ msgResponses });
    const theirs = CjTxMsgData.encode({ data: [], msgResponses }).finish();

    expect(hex(ours)).toBe(toHex(theirs));
  });

  it('matches for multiple responses', () => {
    const msgResponses = [
      { typeUrl: '/test.ResponseA', value: new Uint8Array([1]) },
      { typeUrl: '/test.ResponseB', value: new Uint8Array([2, 3]) },
    ];

    const ours = OurTxMsgData.encode({ msgResponses });
    const theirs = CjTxMsgData.encode({ data: [], msgResponses }).finish();

    expect(hex(ours)).toBe(toHex(theirs));
  });
});

// ─── 11. Signing Comparison ─────────────────────────────────────────────────

describe('Signing: ours vs cosmjs', () => {
  const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('SignDoc encoding matches makeSignBytes', async () => {
    const bodyBytes = new Uint8Array([1, 2, 3]);
    const authInfoBytes = new Uint8Array([4, 5, 6]);
    const chainId = 'test-1';
    const accountNumber = 42n;

    // Our SignDoc encoding
    const ourSignDocBytes = OurSignDoc.encode({ bodyBytes, authInfoBytes, chainId, accountNumber });

    // cosmjs makeSignBytes
    const cjSignDoc = makeSignDoc(bodyBytes, authInfoBytes, chainId, Number(accountNumber));
    const cjSignDocBytes = makeSignBytes(cjSignDoc);

    expect(hex(ourSignDocBytes)).toBe(toHex(cjSignDocBytes));
  });

  it('produces identical signature for the same SignDoc', async () => {
    const ourWallet = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'cosmos' });
    const ourAccounts = await ourWallet.getAccounts();

    const cjWallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, {
      hdPaths: [makeCosmoshubPath(0)],
      prefix: 'cosmos',
    });
    const cjAccounts = await cjWallet.getAccounts();

    const bodyBytes = new Uint8Array([0x0a, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]);
    const authInfoBytes = new Uint8Array([0x12, 0x03, 0x01, 0x02, 0x03]);
    const chainId = 'rebar-test-1';
    const accountNumber = 99n;

    // Our signing
    const ourSignDoc = { bodyBytes, authInfoBytes, chainId, accountNumber };
    const ourResult = await ourWallet.signDirect(ourAccounts[0]!.address, ourSignDoc);

    // cosmjs signing
    const cjSignDoc = makeSignDoc(bodyBytes, authInfoBytes, chainId, Number(accountNumber));
    const cjResult = await cjWallet.signDirect(cjAccounts[0]!.address, cjSignDoc);
    const cjSigBytes = fromBase64(cjResult.signature.signature);

    expect(hex(ourResult.signature)).toBe(toHex(cjSigBytes));
  });

  it('fuzz: signatures match for 10 random SignDocs', async () => {
    const ourWallet = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'cosmos' });
    const ourAccounts = await ourWallet.getAccounts();

    const cjWallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, {
      hdPaths: [makeCosmoshubPath(0)],
      prefix: 'cosmos',
    });
    const cjAccounts = await cjWallet.getAccounts();

    for (let i = 0; i < 10; i++) {
      const bodyBytes = randomBytes(5 + Math.floor(Math.random() * 50));
      const authInfoBytes = randomBytes(5 + Math.floor(Math.random() * 50));
      const chainId = randomString(8);
      const accountNumber = BigInt(Math.floor(Math.random() * 1e6));

      const ourSignDoc = { bodyBytes, authInfoBytes, chainId, accountNumber };
      const ourResult = await ourWallet.signDirect(ourAccounts[0]!.address, ourSignDoc);

      const cjSignDoc = makeSignDoc(bodyBytes, authInfoBytes, chainId, Number(accountNumber));
      const cjResult = await cjWallet.signDirect(cjAccounts[0]!.address, cjSignDoc);
      const cjSigBytes = fromBase64(cjResult.signature.signature);

      expect(hex(ourResult.signature)).toBe(toHex(cjSigBytes));
    }
  });
});

// ─── 12. Full Transaction Pipeline ──────────────────────────────────────────

describe('Full transaction pipeline: ours vs cosmjs', () => {
  const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('complete tx encoding matches', async () => {
    const ourWallet = HDWallet.fromMnemonic(TEST_MNEMONIC, { prefix: 'cosmos' });
    const ourAccounts = await ourWallet.getAccounts();
    const pubkey = ourAccounts[0]!.pubkey;

    const cjWallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_MNEMONIC, {
      hdPaths: [makeCosmoshubPath(0)],
      prefix: 'cosmos',
    });

    // Shared parameters
    const messageValue = new Uint8Array([0x0a, 0x04, 0x74, 0x65, 0x73, 0x74]);
    const message = { typeUrl: '/rebar.rebar.MsgAddData', value: messageValue };
    const memo = 'cross-validation';
    const gasLimit = 200000n;
    const feeAmount = [{ denom: 'urebar', amount: '5000' }];
    const chainId = 'rebar-test-1';
    const accountNumber = 42n;
    const sequence = 0n;

    // ── Our pipeline ──

    // Build TxBody
    const ourBodyBytes = buildTxBody([message], { memo });

    // Build AuthInfo
    const ourAuthInfoBytes = buildAuthInfo(
      { publicKey: pubkey, sequence },
      { amount: feeAmount, gasLimit },
    );

    // Build SignDoc and sign
    const ourSignDoc = { bodyBytes: ourBodyBytes, authInfoBytes: ourAuthInfoBytes, chainId, accountNumber };
    const ourResult = await ourWallet.signDirect(ourAccounts[0]!.address, ourSignDoc);

    // Encode TxRaw
    const ourTxRaw = encodeTxRaw(ourBodyBytes, ourAuthInfoBytes, [ourResult.signature]);

    // ── cosmjs pipeline ──

    // TxBody
    const cjBodyBytes = CjTxBody.encode({
      messages: [message], memo, timeoutHeight: 0n,
      extensionOptions: [], nonCriticalExtensionOptions: [],
      unordered: false,
    }).finish();

    // AuthInfo
    const cjAuthInfoBytes = makeAuthInfoBytes(
      [{
        pubkey: encodePubkey({
          type: 'tendermint/PubKeySecp256k1',
          value: Buffer.from(pubkey).toString('base64'),
        }),
        sequence: Number(sequence),
      }],
      feeAmount,
      Number(gasLimit),
      undefined,
      undefined,
      1,  // SIGN_MODE_DIRECT
    );

    // Verify body and authInfo match
    expect(hex(ourBodyBytes)).toBe(toHex(cjBodyBytes));
    expect(hex(ourAuthInfoBytes)).toBe(toHex(cjAuthInfoBytes));

    // Sign with cosmjs
    const cjSignDoc = makeSignDoc(cjBodyBytes, cjAuthInfoBytes, chainId, Number(accountNumber));
    const cjResult = await cjWallet.signDirect(
      (await cjWallet.getAccounts())[0]!.address,
      cjSignDoc,
    );
    const cjSigBytes = fromBase64(cjResult.signature.signature);

    // Verify signatures match
    expect(hex(ourResult.signature)).toBe(toHex(cjSigBytes));

    // Encode TxRaw with cosmjs
    const cjTxRaw = CjTxRaw.encode({
      bodyBytes: cjBodyBytes,
      authInfoBytes: cjAuthInfoBytes,
      signatures: [cjSigBytes],
    }).finish();

    // Final TxRaw bytes must be identical
    expect(hex(ourTxRaw)).toBe(toHex(cjTxRaw));
  });
});

// ─── 13. Decode Interop ─────────────────────────────────────────────────────

describe('Decode interop: cosmjs encodes, we decode (and vice versa)', () => {
  it('we can decode cosmjs-encoded Coin', () => {
    const cjEncoded = CjCoin.encode({ denom: 'urebar', amount: '12345' }).finish();
    const decoded = OurCoin.decode(cjEncoded);
    expect(decoded.denom).toBe('urebar');
    expect(decoded.amount).toBe('12345');
  });

  it('we can decode cosmjs-encoded TxBody', () => {
    const cjEncoded = CjTxBody.encode({
      messages: [{ typeUrl: '/test.Msg', value: new Uint8Array([1, 2]) }],
      memo: 'hello',
      timeoutHeight: 50n,
      extensionOptions: [],
      nonCriticalExtensionOptions: [],
      unordered: false,
    }).finish();

    const decoded = OurTxBody.decode(cjEncoded);
    expect(decoded.messages[0]!.typeUrl).toBe('/test.Msg');
    expect(decoded.memo).toBe('hello');
    expect(decoded.timeoutHeight).toBe(50n);
  });

  it('we can decode cosmjs-encoded SignDoc', () => {
    const cjEncoded = CjSignDoc.encode({
      bodyBytes: new Uint8Array([0xaa]),
      authInfoBytes: new Uint8Array([0xbb]),
      chainId: 'chain-1',
      accountNumber: 100n,
    }).finish();

    const decoded = OurSignDoc.decode(cjEncoded);
    expect(hex(decoded.bodyBytes)).toBe('aa');
    expect(hex(decoded.authInfoBytes)).toBe('bb');
    expect(decoded.chainId).toBe('chain-1');
    expect(decoded.accountNumber).toBe(100n);
  });

  it('cosmjs can decode our TxRaw', () => {
    const ourEncoded = OurTxRaw.encode({
      bodyBytes: new Uint8Array([1, 2, 3]),
      authInfoBytes: new Uint8Array([4, 5, 6]),
      signatures: [new Uint8Array(64).fill(0xaa)],
    });

    const decoded = CjTxRaw.decode(ourEncoded);
    expect(toHex(decoded.bodyBytes)).toBe('010203');
    expect(toHex(decoded.authInfoBytes)).toBe('040506');
    expect(decoded.signatures.length).toBe(1);
    expect(decoded.signatures[0]!.length).toBe(64);
  });

  it('cosmjs can decode our AuthInfo', () => {
    const pubkeyBytes = new Uint8Array(33).fill(0x02);
    const ourEncoded = OurAuthInfo.encode({
      signerInfos: [{
        publicKey: { typeUrl: '/cosmos.crypto.secp256k1.PubKey', value: OurPubKey.encode({ key: pubkeyBytes }) },
        modeInfo: { single: { mode: SignMode.DIRECT } },
        sequence: 5n,
      }],
      fee: {
        amount: [{ denom: 'urebar', amount: '1000' }],
        gasLimit: 100000n,
      },
    });

    const decoded = CjAuthInfo.decode(ourEncoded);
    expect(decoded.signerInfos.length).toBe(1);
    expect(decoded.signerInfos[0]!.sequence).toBe(5n);
    expect(decoded.fee!.gasLimit).toBe(100000n);
    expect(decoded.fee!.amount[0]!.denom).toBe('urebar');
  });

  it('fuzz: 20 random Coins encode→decode roundtrip across implementations', () => {
    for (let i = 0; i < 20; i++) {
      const denom = randomString(8);
      const amount = String(Math.floor(Math.random() * 1e12));

      // Our encode → cosmjs decode
      const ourEncoded = OurCoin.encode({ denom, amount });
      const cjDecoded = CjCoin.decode(ourEncoded);
      expect(cjDecoded.denom).toBe(denom);
      expect(cjDecoded.amount).toBe(amount);

      // cosmjs encode → our decode
      const cjEncoded = CjCoin.encode({ denom, amount }).finish();
      const ourDecoded = OurCoin.decode(cjEncoded);
      expect(ourDecoded.denom).toBe(denom);
      expect(ourDecoded.amount).toBe(amount);
    }
  });
});

// ─── 14. Signature Low-S Verification ───────────────────────────────────────

describe('Signature properties', () => {
  const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  const halfN = N / 2n;

  it('all signatures are low-S normalized (Cosmos requirement)', () => {
    const key = new Uint8Array(32).fill(1);
    for (let i = 0; i < 30; i++) {
      const msg = ourSha256(new Uint8Array([i]));
      const sig = sign(msg, key);
      const sBytes = sig.slice(32, 64);
      let s = 0n;
      for (const byte of sBytes) {
        s = (s << 8n) | BigInt(byte);
      }
      expect(s <= halfN).toBe(true);
    }
  });

  it('signatures are 64-byte compact format (not DER)', () => {
    const key = new Uint8Array(32).fill(1);
    const msg = ourSha256(new Uint8Array([42]));
    const sig = sign(msg, key);
    expect(sig.length).toBe(64);
    // DER signatures start with 0x30 and are typically 70-72 bytes
    // Compact signatures are exactly 64 bytes (32 R + 32 S)
  });
});
