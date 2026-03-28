import { describe, it, expect } from 'vitest';
import { defineMessage } from '../src/define-message.js';
import { Coin } from '../src/proto/coin.js';
import { defineProto } from '../src/proto-helpers.js';
import type { InferMessage } from '../src/define-message.js';

// ---------------------------------------------------------------------------
// Test codecs
// ---------------------------------------------------------------------------

const CoinDM = defineMessage('/cosmos.base.v1beta1.Coin', {
  denom: { type: 'string', field: 1 },
  amount: { type: 'string', field: 2 },
});

const MsgSend = defineMessage('/cosmos.bank.v1beta1.MsgSend', {
  fromAddress: { type: 'string', field: 1 },
  toAddress: { type: 'string', field: 2 },
  amount: { type: 'message', field: 3, repeated: true, message: CoinDM },
});

const AllScalars = defineMessage('/test.AllScalars', {
  s: { type: 'string', field: 1 },
  b: { type: 'bytes', field: 2 },
  u64: { type: 'uint64', field: 3 },
  i64: { type: 'int64', field: 4 },
  u32: { type: 'uint32', field: 5 },
  i32: { type: 'int32', field: 6 },
  bl: { type: 'bool', field: 7 },
  en: { type: 'enum', field: 8 },
});

const RepeatedScalars = defineMessage('/test.RepeatedScalars', {
  names: { type: 'string', field: 1, repeated: true },
  values: { type: 'uint32', field: 2, repeated: true },
});

const Nested = defineMessage('/test.Nested', {
  label: { type: 'string', field: 1 },
  coin: { type: 'message', field: 2, message: CoinDM },
});

// ---------------------------------------------------------------------------
// Scalar roundtrips
// ---------------------------------------------------------------------------

describe('defineMessage', () => {
  describe('scalar roundtrips', () => {
    it('string', () => {
      const codec = defineMessage('/test.S', { val: { type: 'string', field: 1 } });
      const msg = codec.fromPartial({ val: 'hello' });
      const decoded = codec.decode(codec.encode(msg).finish());
      expect(decoded.val).toBe('hello');
    });

    it('bytes', () => {
      const codec = defineMessage('/test.B', { val: { type: 'bytes', field: 1 } });
      const msg = codec.fromPartial({ val: new Uint8Array([1, 2, 3]) });
      const decoded = codec.decode(codec.encode(msg).finish());
      expect(decoded.val).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('uint64', () => {
      const codec = defineMessage('/test.U64', { val: { type: 'uint64', field: 1 } });
      const msg = codec.fromPartial({ val: 123456789012345n });
      const decoded = codec.decode(codec.encode(msg).finish());
      expect(decoded.val).toBe(123456789012345n);
    });

    it('int64 positive', () => {
      const codec = defineMessage('/test.I64', { val: { type: 'int64', field: 1 } });
      const msg = codec.fromPartial({ val: 42n });
      const decoded = codec.decode(codec.encode(msg).finish());
      expect(decoded.val).toBe(42n);
    });

    it('int64 negative', () => {
      const codec = defineMessage('/test.I64', { val: { type: 'int64', field: 1 } });
      const msg = codec.fromPartial({ val: -100n });
      const decoded = codec.decode(codec.encode(msg).finish());
      expect(decoded.val).toBe(-100n);
    });

    it('uint32', () => {
      const codec = defineMessage('/test.U32', { val: { type: 'uint32', field: 1 } });
      const msg = codec.fromPartial({ val: 42 });
      const decoded = codec.decode(codec.encode(msg).finish());
      expect(decoded.val).toBe(42);
    });

    it('int32 positive', () => {
      const codec = defineMessage('/test.I32', { val: { type: 'int32', field: 1 } });
      const msg = codec.fromPartial({ val: 100 });
      const decoded = codec.decode(codec.encode(msg).finish());
      expect(decoded.val).toBe(100);
    });

    it('int32 negative', () => {
      const codec = defineMessage('/test.I32', { val: { type: 'int32', field: 1 } });
      const msg = codec.fromPartial({ val: -42 });
      const decoded = codec.decode(codec.encode(msg).finish());
      expect(decoded.val).toBe(-42);
    });

    it('bool', () => {
      const codec = defineMessage('/test.Bool', { val: { type: 'bool', field: 1 } });
      const msg = codec.fromPartial({ val: true });
      const decoded = codec.decode(codec.encode(msg).finish());
      expect(decoded.val).toBe(true);
    });

    it('enum', () => {
      const codec = defineMessage('/test.Enum', { val: { type: 'enum', field: 1 } });
      const msg = codec.fromPartial({ val: 3 });
      const decoded = codec.decode(codec.encode(msg).finish());
      expect(decoded.val).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Default values (proto3 semantics)
  // ---------------------------------------------------------------------------

  describe('fromPartial defaults', () => {
    it('fills all scalar defaults', () => {
      const msg = AllScalars.fromPartial({});
      expect(msg.s).toBe('');
      expect(msg.b).toEqual(new Uint8Array(0));
      expect(msg.u64).toBe(0n);
      expect(msg.i64).toBe(0n);
      expect(msg.u32).toBe(0);
      expect(msg.i32).toBe(0);
      expect(msg.bl).toBe(false);
      expect(msg.en).toBe(0);
    });

    it('repeated fields default to empty arrays', () => {
      const msg = RepeatedScalars.fromPartial({});
      expect(msg.names).toEqual([]);
      expect(msg.values).toEqual([]);
    });

    it('singular message field defaults to undefined', () => {
      const msg = Nested.fromPartial({});
      expect(msg.coin).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Default values are skipped in encoding (proto3)
  // ---------------------------------------------------------------------------

  describe('proto3 default value skipping', () => {
    it('empty message encodes to zero bytes', () => {
      const msg = AllScalars.fromPartial({});
      const bytes = AllScalars.encode(msg).finish();
      expect(bytes.length).toBe(0);
    });

    it('empty repeated encodes to zero bytes', () => {
      const msg = RepeatedScalars.fromPartial({});
      const bytes = RepeatedScalars.encode(msg).finish();
      expect(bytes.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Nested message
  // ---------------------------------------------------------------------------

  describe('nested messages', () => {
    it('roundtrips nested message', () => {
      const msg = Nested.fromPartial({
        label: 'test',
        coin: { denom: 'uatom', amount: '1000' },
      });
      const bytes = Nested.encode(msg).finish();
      const decoded = Nested.decode(bytes);
      expect(decoded.label).toBe('test');
      expect(decoded.coin).toEqual({ denom: 'uatom', amount: '1000' });
    });
  });

  // ---------------------------------------------------------------------------
  // Repeated fields
  // ---------------------------------------------------------------------------

  describe('repeated fields', () => {
    it('repeated strings', () => {
      const msg = RepeatedScalars.fromPartial({ names: ['a', 'b', 'c'] });
      const bytes = RepeatedScalars.encode(msg).finish();
      const decoded = RepeatedScalars.decode(bytes);
      expect(decoded.names).toEqual(['a', 'b', 'c']);
    });

    it('repeated uint32', () => {
      const msg = RepeatedScalars.fromPartial({ values: [1, 2, 3] });
      const bytes = RepeatedScalars.encode(msg).finish();
      const decoded = RepeatedScalars.decode(bytes);
      expect(decoded.values).toEqual([1, 2, 3]);
    });

    it('repeated messages', () => {
      const msg = MsgSend.fromPartial({
        fromAddress: 'cosmos1abc',
        toAddress: 'cosmos1def',
        amount: [
          { denom: 'uatom', amount: '1000' },
          { denom: 'ustake', amount: '500' },
        ],
      });
      const bytes = MsgSend.encode(msg).finish();
      const decoded = MsgSend.decode(bytes);
      expect(decoded.fromAddress).toBe('cosmos1abc');
      expect(decoded.toAddress).toBe('cosmos1def');
      expect(decoded.amount).toHaveLength(2);
      expect(decoded.amount[0]).toEqual({ denom: 'uatom', amount: '1000' });
      expect(decoded.amount[1]).toEqual({ denom: 'ustake', amount: '500' });
    });
  });

  // ---------------------------------------------------------------------------
  // Byte-for-byte compatibility with hand-coded Coin
  // ---------------------------------------------------------------------------

  describe('compatibility with hand-coded proto', () => {
    it('Coin matches hand-coded encoding', () => {
      const coin = { denom: 'uatom', amount: '1000000' };
      const handCoded = Coin.encode(coin);
      const defineMsgBytes = CoinDM.encode(CoinDM.fromPartial(coin)).finish();
      expect(defineMsgBytes).toEqual(handCoded);
    });

    it('Coin matches hand-coded decoding', () => {
      const coin = { denom: 'uatom', amount: '1000000' };
      const encoded = Coin.encode(coin);
      const decoded = CoinDM.decode(encoded);
      expect(decoded).toEqual(coin);
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown field skipping
  // ---------------------------------------------------------------------------

  describe('unknown field handling', () => {
    it('skips unknown fields during decode', () => {
      // Encode with extra field the decoder doesn't know about
      const Full = defineMessage('/test.Full', {
        name: { type: 'string', field: 1 },
        age: { type: 'uint32', field: 2 },
        extra: { type: 'string', field: 99 },
      });
      const Partial = defineMessage('/test.Partial', {
        name: { type: 'string', field: 1 },
        age: { type: 'uint32', field: 2 },
      });

      const bytes = Full.encode(Full.fromPartial({
        name: 'alice', age: 30, extra: 'ignored',
      })).finish();
      const decoded = Partial.decode(bytes);
      expect(decoded.name).toBe('alice');
      expect(decoded.age).toBe(30);
    });
  });

  // ---------------------------------------------------------------------------
  // defineProto compatibility
  // ---------------------------------------------------------------------------

  describe('defineProto compatibility', () => {
    it('works as a codec for defineProto message helper', () => {
      const MsgSendResponse = defineMessage('/cosmos.bank.v1beta1.MsgSendResponse', {});

      const bank = defineProto({
        MsgSend,
        MsgSendResponse,
      }, 'cosmos.bank.v1beta1');

      const encoded = bank.Send({
        fromAddress: 'cosmos1abc',
        toAddress: 'cosmos1def',
        amount: [{ denom: 'uatom', amount: '100' }],
      });

      expect(encoded.typeUrl).toBe('/cosmos.bank.v1beta1.MsgSend');
      expect(encoded.value).toBeInstanceOf(Uint8Array);
      expect(encoded.value.length).toBeGreaterThan(0);
    });

    it('works as a codec for defineProto query helper', () => {
      const QueryBalanceRequest = defineMessage('/cosmos.bank.v1beta1.QueryBalanceRequest', {
        address: { type: 'string', field: 1 },
        denom: { type: 'string', field: 2 },
      });
      const QueryBalanceResponse = defineMessage('/cosmos.bank.v1beta1.QueryBalanceResponse', {
        balance: { type: 'message', field: 1, message: CoinDM },
      });

      const bank = defineProto({
        QueryBalanceRequest,
        QueryBalanceResponse,
      }, 'cosmos.bank.v1beta1');

      expect(bank.Balance.path).toBe('/cosmos.bank.v1beta1.Query/Balance');
    });
  });

  // ---------------------------------------------------------------------------
  // Type inference
  // ---------------------------------------------------------------------------

  describe('type inference', () => {
    it('infers correct types from schema', () => {
      type CoinMsg = InferMessage<{
        denom: { type: 'string'; field: 1 };
        amount: { type: 'string'; field: 2 };
      }>;

      // This is a compile-time check — if types are wrong, this won't compile
      const coin: CoinMsg = { denom: 'uatom', amount: '1000' };
      expect(coin.denom).toBe('uatom');
    });
  });

  // ---------------------------------------------------------------------------
  // Non-contiguous field numbers
  // ---------------------------------------------------------------------------

  describe('non-contiguous field numbers', () => {
    it('handles gaps in field numbers', () => {
      const codec = defineMessage('/test.Gaps', {
        first: { type: 'string', field: 1 },
        fifth: { type: 'uint32', field: 5 },
        tenth: { type: 'bool', field: 10 },
      });

      const msg = codec.fromPartial({ first: 'hi', fifth: 42, tenth: true });
      const decoded = codec.decode(codec.encode(msg).finish());
      expect(decoded.first).toBe('hi');
      expect(decoded.fifth).toBe(42);
      expect(decoded.tenth).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-codec message nesting (codegen'd + defineMessage)
  // ---------------------------------------------------------------------------

  describe('cross-codec nesting', () => {
    it('accepts hand-coded codec as nested message', () => {
      // Use the hand-coded Coin from proto/coin.ts as a nested message
      const Wrapper = defineMessage('/test.Wrapper', {
        label: { type: 'string', field: 1 },
        coin: { type: 'message', field: 2, message: Coin as any },
      });

      const msg = Wrapper.fromPartial({
        label: 'test',
        coin: { denom: 'uatom', amount: '500' },
      });
      const bytes = Wrapper.encode(msg).finish();
      const decoded = Wrapper.decode(bytes);
      expect(decoded.label).toBe('test');
      expect(decoded.coin).toEqual({ denom: 'uatom', amount: '500' });
    });
  });
});
