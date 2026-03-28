import { describe, it, expect } from 'vitest';
import { TxBody, AuthInfo, SignDoc, TxRaw, Tx, SignMode } from '../src/proto/tx';
import { Any } from '../src/proto/any';
import { Coin } from '../src/proto/coin';
import { PubKey } from '../src/proto/keys';
import { TxMsgData } from '../src/proto/abci';
import { buildTxBody, buildAuthInfo, buildSignDoc } from '../src/tx/build';
import { encodeTxRaw } from '../src/tx/encode';
import { decodeTx, decodeTxMsgData } from '../src/tx/decode';

describe('Proto encode/decode roundtrips', () => {
  it('Any roundtrips', () => {
    const msg: Any = { typeUrl: '/test.Message', value: new Uint8Array([1, 2, 3]) };
    const encoded = Any.encode(msg);
    const decoded = Any.decode(encoded);
    expect(decoded.typeUrl).toBe(msg.typeUrl);
    expect(decoded.value).toEqual(msg.value);
  });

  it('Coin roundtrips', () => {
    const coin: Coin = { denom: 'urebar', amount: '1000' };
    const encoded = Coin.encode(coin);
    const decoded = Coin.decode(encoded);
    expect(decoded).toEqual(coin);
  });

  it('PubKey roundtrips', () => {
    const key: PubKey = { key: new Uint8Array(33).fill(2) };
    const encoded = PubKey.encode(key);
    const decoded = PubKey.decode(encoded);
    expect(decoded.key).toEqual(key.key);
  });

  it('TxBody roundtrips with messages and options', () => {
    const body: TxBody = {
      messages: [
        { typeUrl: '/rebar.rebar.MsgCreateInput', value: new Uint8Array([10, 20]) },
        { typeUrl: '/rebar.rebar.MsgAddData', value: new Uint8Array([30, 40]) },
      ],
      memo: 'test memo',
      timeoutHeight: 0n,
      extensionOptions: [],
      nonCriticalExtensionOptions: [],
      unordered: true,
      timeoutTimestamp: undefined,
    };
    const encoded = TxBody.encode(body);
    const decoded = TxBody.decode(encoded);
    expect(decoded.messages.length).toBe(2);
    expect(decoded.messages[0]!.typeUrl).toBe('/rebar.rebar.MsgCreateInput');
    expect(decoded.messages[0]!.value).toEqual(new Uint8Array([10, 20]));
    expect(decoded.memo).toBe('test memo');
    expect(decoded.unordered).toBe(true);
  });

  it('SignDoc roundtrips', () => {
    const doc: SignDoc = {
      bodyBytes: new Uint8Array([1, 2, 3]),
      authInfoBytes: new Uint8Array([4, 5, 6]),
      chainId: 'rebar-test-1',
      accountNumber: 42n,
    };
    const encoded = SignDoc.encode(doc);
    const decoded = SignDoc.decode(encoded);
    expect(decoded.bodyBytes).toEqual(doc.bodyBytes);
    expect(decoded.authInfoBytes).toEqual(doc.authInfoBytes);
    expect(decoded.chainId).toBe('rebar-test-1');
    expect(decoded.accountNumber).toBe(42n);
  });

  it('TxRaw roundtrips', () => {
    const raw: TxRaw = {
      bodyBytes: new Uint8Array([1, 2]),
      authInfoBytes: new Uint8Array([3, 4]),
      signatures: [new Uint8Array(64).fill(0xab)],
    };
    const encoded = TxRaw.encode(raw);
    const decoded = TxRaw.decode(encoded);
    expect(decoded.bodyBytes).toEqual(raw.bodyBytes);
    expect(decoded.authInfoBytes).toEqual(raw.authInfoBytes);
    expect(decoded.signatures.length).toBe(1);
    expect(decoded.signatures[0]).toEqual(raw.signatures[0]);
  });

  it('AuthInfo roundtrips with signer info and fee', () => {
    const info: AuthInfo = {
      signerInfos: [{
        publicKey: { typeUrl: PubKey.typeUrl, value: PubKey.encode({ key: new Uint8Array(33).fill(3) }) },
        modeInfo: { single: { mode: SignMode.DIRECT } },
        sequence: 5n,
      }],
      fee: {
        amount: [{ denom: 'urebar', amount: '500' }],
        gasLimit: 200000n,
      },
    };
    const encoded = AuthInfo.encode(info);
    const decoded = AuthInfo.decode(encoded);
    expect(decoded.signerInfos.length).toBe(1);
    expect(decoded.signerInfos[0]!.sequence).toBe(5n);
    expect(decoded.signerInfos[0]!.modeInfo?.single?.mode).toBe(SignMode.DIRECT);
    expect(decoded.fee?.gasLimit).toBe(200000n);
    expect(decoded.fee?.amount[0]!.denom).toBe('urebar');
  });

  it('TxMsgData roundtrips', () => {
    const data: TxMsgData = {
      msgResponses: [
        { typeUrl: '/rebar.rebar.MsgCreateInputResponse', value: new Uint8Array([1]) },
      ],
    };
    const encoded = TxMsgData.encode(data);
    const decoded = TxMsgData.decode(encoded);
    expect(decoded.msgResponses.length).toBe(1);
    expect(decoded.msgResponses[0]!.typeUrl).toBe('/rebar.rebar.MsgCreateInputResponse');
  });

  it('Tx roundtrips (full transaction)', () => {
    const tx: Tx = {
      body: TxBody.fromPartial({
        messages: [{ typeUrl: '/test', value: new Uint8Array([1]) }],
        memo: 'hello',
      }),
      authInfo: AuthInfo.fromPartial({
        fee: { amount: [{ denom: 'urebar', amount: '100' }], gasLimit: 50000n },
      }),
      signatures: [new Uint8Array(64).fill(0xff)],
    };
    const encoded = Tx.encode(tx);
    const decoded = Tx.decode(encoded);
    expect(decoded.body?.messages.length).toBe(1);
    expect(decoded.body?.memo).toBe('hello');
    expect(decoded.authInfo?.fee?.gasLimit).toBe(50000n);
    expect(decoded.signatures.length).toBe(1);
  });
});

describe('Transaction building', () => {
  const fakePubkey = new Uint8Array(33).fill(2);

  it('buildTxBody encodes messages', () => {
    const body = buildTxBody([
      { typeUrl: '/test.Msg', value: new Uint8Array([1, 2, 3]) },
    ], { memo: 'test' });

    const decoded = TxBody.decode(body);
    expect(decoded.messages.length).toBe(1);
    expect(decoded.memo).toBe('test');
  });

  it('buildAuthInfo encodes signer and fee', () => {
    const authInfo = buildAuthInfo(
      { publicKey: fakePubkey, sequence: 10n },
      { amount: [{ denom: 'urebar', amount: '250' }], gasLimit: 100000n },
    );

    const decoded = AuthInfo.decode(authInfo);
    expect(decoded.signerInfos[0]!.sequence).toBe(10n);
    expect(decoded.fee?.gasLimit).toBe(100000n);
  });

  it('buildSignDoc encodes all fields', () => {
    const signDoc = buildSignDoc(
      new Uint8Array([1]),
      new Uint8Array([2]),
      'rebar-1',
      7n,
    );

    const decoded = SignDoc.decode(signDoc);
    expect(decoded.chainId).toBe('rebar-1');
    expect(decoded.accountNumber).toBe(7n);
  });

  it('encodeTxRaw produces decodable output', () => {
    const body = buildTxBody([{ typeUrl: '/test', value: new Uint8Array([1]) }]);
    const authInfo = buildAuthInfo(
      { publicKey: fakePubkey, sequence: 0n },
      { amount: [], gasLimit: 100000n },
    );
    const sig = new Uint8Array(64).fill(0xaa);
    const txBytes = encodeTxRaw(body, authInfo, [sig]);

    const decoded = decodeTx(txBytes);
    expect(decoded.body?.messages.length).toBe(1);
    expect(decoded.signatures[0]).toEqual(sig);
  });
});

// ─── Encoding Edge Cases ──────────────────────────────────────────────────

describe('Transaction building — edge cases', () => {
  const fakePubkey = new Uint8Array(33).fill(2);

  it('handles a large message payload (10 KB)', () => {
    const largeValue = new Uint8Array(10_000).fill(0xab);
    const body = buildTxBody([
      { typeUrl: '/cosmos.wasm.v1.MsgExecuteContract', value: largeValue },
    ]);

    const decoded = TxBody.decode(body);
    expect(decoded.messages[0]!.value.length).toBe(10_000);
    expect(decoded.messages[0]!.value[0]).toBe(0xab);
    expect(decoded.messages[0]!.value[9999]).toBe(0xab);
  });

  it('handles many messages in one transaction (50)', () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      typeUrl: `/test.Msg${i}`,
      value: new Uint8Array([i & 0xff]),
    }));

    const body = buildTxBody(messages);
    const decoded = TxBody.decode(body);
    expect(decoded.messages).toHaveLength(50);
    expect(decoded.messages[0]!.typeUrl).toBe('/test.Msg0');
    expect(decoded.messages[49]!.typeUrl).toBe('/test.Msg49');
    expect(decoded.messages[49]!.value).toEqual(new Uint8Array([49]));
  });

  it('handles maximum memo length (256 bytes)', () => {
    const longMemo = 'x'.repeat(256);
    const body = buildTxBody(
      [{ typeUrl: '/test.Msg', value: new Uint8Array([1]) }],
      { memo: longMemo },
    );

    const decoded = TxBody.decode(body);
    expect(decoded.memo).toBe(longMemo);
    expect(decoded.memo.length).toBe(256);
  });

  it('handles chain ID with underscore and hyphen (evmos-style)', () => {
    const signDoc = buildSignDoc(
      new Uint8Array([1]),
      new Uint8Array([2]),
      'evmos_9001-2',
      100n,
    );

    const decoded = SignDoc.decode(signDoc);
    expect(decoded.chainId).toBe('evmos_9001-2');
  });

  it('handles very large account number (beyond JS safe integer)', () => {
    const largeAccountNum = 2n ** 53n + 1n;
    const signDoc = buildSignDoc(
      new Uint8Array([1]),
      new Uint8Array([2]),
      'chain-1',
      largeAccountNum,
    );

    const decoded = SignDoc.decode(signDoc);
    expect(decoded.accountNumber).toBe(largeAccountNum);
  });

  it('handles account number at uint64 upper range', () => {
    const maxUint64 = 2n ** 64n - 1n;
    const signDoc = buildSignDoc(
      new Uint8Array([1]),
      new Uint8Array([2]),
      'chain-1',
      maxUint64,
    );

    const decoded = SignDoc.decode(signDoc);
    expect(decoded.accountNumber).toBe(maxUint64);
  });

  it('handles empty chain ID', () => {
    const signDoc = buildSignDoc(
      new Uint8Array([1]),
      new Uint8Array([2]),
      '',
      0n,
    );

    const decoded = SignDoc.decode(signDoc);
    expect(decoded.chainId).toBe('');
  });

  it('handles large sequence number', () => {
    const authInfo = buildAuthInfo(
      { publicKey: fakePubkey, sequence: 999_999n },
      { amount: [{ denom: 'urebar', amount: '100' }], gasLimit: 100000n },
    );

    const decoded = AuthInfo.decode(authInfo);
    expect(decoded.signerInfos[0]!.sequence).toBe(999_999n);
  });

  it('handles multi-denom fee', () => {
    const authInfo = buildAuthInfo(
      { publicKey: fakePubkey, sequence: 0n },
      {
        amount: [
          { denom: 'uatom', amount: '500' },
          { denom: 'uosmo', amount: '1000' },
        ],
        gasLimit: 300000n,
      },
    );

    const decoded = AuthInfo.decode(authInfo);
    expect(decoded.fee?.amount).toHaveLength(2);
    expect(decoded.fee?.amount[0]!.denom).toBe('uatom');
    expect(decoded.fee?.amount[1]!.denom).toBe('uosmo');
  });

  it('handles empty messages array', () => {
    const body = buildTxBody([]);
    const decoded = TxBody.decode(body);
    expect(decoded.messages).toHaveLength(0);
  });

  it('full roundtrip: large tx encodes and decodes through TxRaw', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      typeUrl: '/test.BatchMsg',
      value: new Uint8Array(500).fill(i & 0xff),
    }));

    const body = buildTxBody(messages, { memo: 'batch of 10' });
    const authInfo = buildAuthInfo(
      { publicKey: fakePubkey, sequence: 42n },
      { amount: [{ denom: 'urebar', amount: '10000' }], gasLimit: 2_000_000n },
    );
    const sig = new Uint8Array(64).fill(0xcc);
    const txBytes = encodeTxRaw(body, authInfo, [sig]);

    const decoded = decodeTx(txBytes);
    expect(decoded.body?.messages).toHaveLength(10);
    expect(decoded.body?.memo).toBe('batch of 10');
    expect(decoded.authInfo?.fee?.gasLimit).toBe(2_000_000n);
    expect(decoded.signatures[0]!.length).toBe(64);
  });
});
