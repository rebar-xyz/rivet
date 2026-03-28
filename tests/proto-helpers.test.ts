import { describe, it, expect, expectTypeOf } from 'vitest';
import { defineProto } from '../src/proto-helpers';
import { TxMsgData } from '../src/proto/abci';

// ---------------------------------------------------------------------------
// Mock codecs — mimic ts-proto MessageFns<T> shape
// ---------------------------------------------------------------------------

interface MockMsg { name: string; value: number }
interface MockMsgResponse { address: string }
interface MockQueryReq { id: string }
interface MockQueryResp { data: string }

const MockMsgCodec = {
  encode(message: MockMsg) {
    const bytes = new TextEncoder().encode(JSON.stringify(message));
    return { finish: () => bytes };
  },
  decode(input: Uint8Array): MockMsg {
    return JSON.parse(new TextDecoder().decode(input));
  },
  fromPartial(partial: Partial<MockMsg>): MockMsg {
    return { name: partial.name ?? '', value: partial.value ?? 0 };
  },
};

const MockMsgResponseCodec = {
  encode(message: MockMsgResponse) {
    const bytes = new TextEncoder().encode(JSON.stringify(message));
    return { finish: () => bytes };
  },
  decode(input: Uint8Array): MockMsgResponse {
    return JSON.parse(new TextDecoder().decode(input));
  },
  fromPartial(partial: Partial<MockMsgResponse>): MockMsgResponse {
    return { address: partial.address ?? '' };
  },
};

const MockQueryReqCodec = {
  encode(message: MockQueryReq) {
    const bytes = new TextEncoder().encode(JSON.stringify(message));
    return { finish: () => bytes };
  },
  decode(input: Uint8Array): MockQueryReq {
    return JSON.parse(new TextDecoder().decode(input));
  },
  fromPartial(partial: Partial<MockQueryReq>): MockQueryReq {
    return { id: partial.id ?? '' };
  },
};

const MockQueryRespCodec = {
  encode(message: MockQueryResp) {
    const bytes = new TextEncoder().encode(JSON.stringify(message));
    return { finish: () => bytes };
  },
  decode(input: Uint8Array): MockQueryResp {
    return JSON.parse(new TextDecoder().decode(input));
  },
  fromPartial(partial: Partial<MockQueryResp>): MockQueryResp {
    return { data: partial.data ?? '' };
  },
};

// ---------------------------------------------------------------------------
// Message detection and encoding
// ---------------------------------------------------------------------------

describe('defineProto — messages', () => {
  it('strips Msg prefix for helper names', () => {
    const helpers = defineProto({
      MsgAddData: MockMsgCodec,
      MsgAddDataResponse: MockMsgResponseCodec,
    }, 'test.pkg');

    expect(helpers.AddData).toBeDefined();
    expect(helpers.AddData.typeUrl).toBe('/test.pkg.MsgAddData');
  });

  it('callable encodes to { typeUrl, value, msg }', () => {
    const helpers = defineProto({
      MsgAddData: MockMsgCodec,
      MsgAddDataResponse: MockMsgResponseCodec,
    }, 'test.pkg');

    const result = helpers.AddData({ name: 'hello', value: 42 });
    expect(result.typeUrl).toBe('/test.pkg.MsgAddData');
    expect(result.value).toBeInstanceOf(Uint8Array);
    expect(result.msg).toEqual({ name: 'hello', value: 42 });
  });

  it('fills defaults via fromPartial', () => {
    const helpers = defineProto({ MsgAddData: MockMsgCodec }, 'test.pkg');
    const result = helpers.AddData({ name: 'only-name' });
    const decoded = MockMsgCodec.decode(result.value);
    expect(decoded).toEqual({ name: 'only-name', value: 0 });
  });

  it('standalone message without Response has no decodeResponse', () => {
    const helpers = defineProto({ MsgUpdateParams: MockMsgCodec }, 'test.pkg');
    expect(helpers.UpdateParams).toBeDefined();
    expect(helpers.UpdateParams.typeUrl).toBe('/test.pkg.MsgUpdateParams');
    expect(helpers.UpdateParams.decodeResponse).toBeUndefined();
    expect(helpers.UpdateParams.decodeBatchResponse).toBeUndefined();
  });

  it('message with Response has decodeResponse and decodeBatchResponse', () => {
    const helpers = defineProto({
      MsgAddData: MockMsgCodec,
      MsgAddDataResponse: MockMsgResponseCodec,
    }, 'test.pkg');

    expect(typeof helpers.AddData.decodeResponse).toBe('function');
    expect(typeof helpers.AddData.decodeBatchResponse).toBe('function');
  });

  it('exposes passthrough encode/decode/fromPartial', () => {
    const helpers = defineProto({ MsgAddData: MockMsgCodec }, 'test.pkg');
    const full = helpers.AddData.fromPartial({ name: 'test' });
    expect(full).toEqual({ name: 'test', value: 0 });
    const encoded = helpers.AddData.encode(full).finish();
    const decoded = helpers.AddData.decode(encoded);
    expect(decoded).toEqual(full);
  });
});

// ---------------------------------------------------------------------------
// Response decoding
// ---------------------------------------------------------------------------

describe('defineProto — response decoding', () => {
  function makeConfirmResult(typeUrl: string, responseBytes: Uint8Array) {
    const txMsgDataBytes = TxMsgData.encode({
      msgResponses: [{ typeUrl, value: responseBytes }],
    });
    return {
      broadcastResponse: {
        tx: new Uint8Array(0),
        txResult: { code: 0, log: '', data: txMsgDataBytes, gasUsed: 0n, gasWanted: 0n, events: [] },
        height: 100,
        hash: new Uint8Array(32),
      },
    };
  }

  function makeSyncResult(typeUrl: string, responseBytes: Uint8Array) {
    const txMsgDataBytes = TxMsgData.encode({
      msgResponses: [{ typeUrl, value: responseBytes }],
    });
    return {
      broadcastResponse: {
        hash: new Uint8Array(32),
        code: 0,
        data: txMsgDataBytes,
        gasUsed: 0n,
        gasWanted: 0n,
        log: '',
        events: [],
        info: '',
      },
    };
  }

  it('decodes from confirm response', () => {
    const helpers = defineProto({
      MsgAddData: MockMsgCodec,
      MsgAddDataResponse: MockMsgResponseCodec,
    }, 'test.pkg');
    const responseBytes = MockMsgResponseCodec.encode({ address: 'rebar1abc' }).finish();
    const result = makeConfirmResult('/test.pkg.MsgAddDataResponse', responseBytes);

    const decoded = helpers.AddData.decodeResponse(result);
    expect(decoded).toEqual({ address: 'rebar1abc' });
  });

  it('decodes from sync response', () => {
    const helpers = defineProto({
      MsgAddData: MockMsgCodec,
      MsgAddDataResponse: MockMsgResponseCodec,
    }, 'test.pkg');
    const responseBytes = MockMsgResponseCodec.encode({ address: 'rebar1xyz' }).finish();
    const result = makeSyncResult('/test.pkg.MsgAddDataResponse', responseBytes);

    const decoded = helpers.AddData.decodeResponse(result);
    expect(decoded).toEqual({ address: 'rebar1xyz' });
  });

  it('returns fromPartial({}) when no data', () => {
    const helpers = defineProto({
      MsgAddData: MockMsgCodec,
      MsgAddDataResponse: MockMsgResponseCodec,
    }, 'test.pkg');
    const result = {
      broadcastResponse: {
        tx: new Uint8Array(0),
        txResult: { code: 0, log: '', data: undefined, gasUsed: 0n, gasWanted: 0n, events: [] },
        height: 100,
        hash: new Uint8Array(32),
      },
    };

    const decoded = helpers.AddData.decodeResponse(result);
    expect(decoded).toEqual({ address: '' });
  });

  it('decodeBatchResponse handles multiple matching responses', () => {
    const helpers = defineProto({
      MsgAddData: MockMsgCodec,
      MsgAddDataResponse: MockMsgResponseCodec,
    }, 'test.pkg');
    const typeUrl = '/test.pkg.MsgAddDataResponse';

    const txMsgDataBytes = TxMsgData.encode({
      msgResponses: [
        { typeUrl, value: MockMsgResponseCodec.encode({ address: 'addr1' }).finish() },
        { typeUrl, value: MockMsgResponseCodec.encode({ address: 'addr2' }).finish() },
        { typeUrl: '/other.Type', value: new Uint8Array([1, 2, 3]) },
      ],
    });
    const result = {
      broadcastResponse: {
        tx: new Uint8Array(0),
        txResult: { code: 0, log: '', data: txMsgDataBytes, gasUsed: 0n, gasWanted: 0n, events: [] },
        height: 100,
        hash: new Uint8Array(32),
      },
    };

    const decoded = helpers.AddData.decodeBatchResponse(result);
    expect(decoded).toEqual([{ address: 'addr1' }, { address: 'addr2' }]);
  });

  it('decodeBatchResponse returns empty array when no data', () => {
    const helpers = defineProto({
      MsgAddData: MockMsgCodec,
      MsgAddDataResponse: MockMsgResponseCodec,
    }, 'test.pkg');
    const result = {
      broadcastResponse: {
        tx: new Uint8Array(0),
        txResult: { code: 0, log: '', data: undefined, gasUsed: 0n, gasWanted: 0n, events: [] },
        height: 100,
        hash: new Uint8Array(32),
      },
    };
    expect(helpers.AddData.decodeBatchResponse(result)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Query detection and execution
// ---------------------------------------------------------------------------

describe('defineProto — queries', () => {
  it('detects Query${X}Request + Response pairs and strips prefix', () => {
    const helpers = defineProto({
      QueryGetNodeRequest: MockQueryReqCodec,
      QueryGetNodeResponse: MockQueryRespCodec,
    }, 'rebar.rebar');

    expect(helpers.GetNode).toBeDefined();
    expect(helpers.GetNode.path).toBe('/rebar.rebar.Query/GetNode');
  });

  it('executes query via QueryClient', async () => {
    const helpers = defineProto({
      QueryGetNodeRequest: MockQueryReqCodec,
      QueryGetNodeResponse: MockQueryRespCodec,
    }, 'rebar.rebar');

    const mockClient = {
      query: async (_path: string, _data: Uint8Array): Promise<Uint8Array> => {
        return MockQueryRespCodec.encode({ data: 'node-data' }).finish();
      },
    };

    const result = await helpers.GetNode(mockClient, { id: 'test-id' });
    expect(result).toEqual({ data: 'node-data' });
  });

  it('passes correct path and encoded bytes to query client', async () => {
    const helpers = defineProto({
      QueryGetNodeRequest: MockQueryReqCodec,
      QueryGetNodeResponse: MockQueryRespCodec,
    }, 'rebar.rebar');

    let capturedPath = '';
    let capturedData: Uint8Array | undefined;

    const mockClient = {
      query: async (path: string, data: Uint8Array): Promise<Uint8Array> => {
        capturedPath = path;
        capturedData = data;
        return MockQueryRespCodec.encode({ data: 'ok' }).finish();
      },
    };

    await helpers.GetNode(mockClient, { id: 'abc' });
    expect(capturedPath).toBe('/rebar.rebar.Query/GetNode');
    // Verify the data is the encoded request
    const decoded = MockQueryReqCodec.decode(capturedData!);
    expect(decoded).toEqual({ id: 'abc' });
  });

  it('throws on unpaired query request (no response)', () => {
    expect(() => defineProto({
      QueryFooRequest: MockQueryReqCodec,
    }, 'test.pkg')).toThrow('QueryFooRequest has no matching QueryFooResponse');
  });
});

// ---------------------------------------------------------------------------
// Edge cases and filtering
// ---------------------------------------------------------------------------

describe('defineProto — edge cases', () => {
  it('skips non-codec entries', () => {
    const helpers = defineProto({
      protobufPackage: 'test.pkg' as any,
      SomeClass: class {} as any,
      undef: undefined as any,
      num: 42 as any,
      MsgAddData: MockMsgCodec,
    }, 'test.pkg');

    expect(helpers.AddData).toBeDefined();
    expect((helpers as any).protobufPackage).toBeUndefined();
    expect((helpers as any).SomeClass).toBeUndefined();
    expect((helpers as any).undef).toBeUndefined();
    expect((helpers as any).num).toBeUndefined();
  });

  it('skips nested response types like QueryNodeInputsResponse_InputInfo', () => {
    const helpers = defineProto({
      QueryNodeInputsResponse_InputInfo: MockQueryRespCodec,
      QueryGetNodeRequest: MockQueryReqCodec,
      QueryGetNodeResponse: MockQueryRespCodec,
    }, 'test.pkg');

    // _InputInfo has underscore, should be skipped
    expect(helpers.GetNode).toBeDefined();
    expect((helpers as any).NodeInputsResponse_InputInfo).toBeUndefined();
  });

  it('skips QueryServiceName (string) and QueryClientImpl (class)', () => {
    const helpers = defineProto({
      QueryServiceName: 'rebar.rebar.Query' as any,
      QueryClientImpl: class {} as any,
      MsgAddData: MockMsgCodec,
    }, 'test.pkg');

    expect(helpers.AddData).toBeDefined();
    expect((helpers as any).ServiceName).toBeUndefined();
    expect((helpers as any).ClientImpl).toBeUndefined();
  });

  it('MsgUpdateParams with no response is valid, no decode', () => {
    const helpers = defineProto({ MsgUpdateParams: MockMsgCodec }, 'test.pkg');
    expect(helpers.UpdateParams).toBeDefined();
    expect(helpers.UpdateParams.typeUrl).toBe('/test.pkg.MsgUpdateParams');
    expect(helpers.UpdateParams.decodeResponse).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Type inference — compile-time verification via expectTypeOf
// ---------------------------------------------------------------------------

describe('defineProto — type inference', () => {
  const helpers = defineProto({
    MsgAddData: MockMsgCodec,
    MsgAddDataResponse: MockMsgResponseCodec,
    MsgUpdateParams: MockMsgCodec,
    QueryGetNodeRequest: MockQueryReqCodec,
    QueryGetNodeResponse: MockQueryRespCodec,
  }, 'test.pkg');

  it('typeUrl is a literal string type, not string or any', () => {
    expectTypeOf(helpers.AddData.typeUrl).toEqualTypeOf<'/test.pkg.MsgAddData'>();
    expectTypeOf(helpers.UpdateParams.typeUrl).toEqualTypeOf<'/test.pkg.MsgUpdateParams'>();
  });

  it('decode returns the correct message type', () => {
    expectTypeOf(helpers.AddData.decode).returns.toEqualTypeOf<MockMsg>();
    expectTypeOf(helpers.UpdateParams.decode).returns.toEqualTypeOf<MockMsg>();
  });

  it('fromPartial accepts the correct partial type', () => {
    expectTypeOf(helpers.AddData.fromPartial).parameter(0).toEqualTypeOf<Partial<MockMsg>>();
  });

  it('callable returns typed { typeUrl, value, msg }', () => {
    const result = helpers.AddData({ name: 'x', value: 1 });
    expectTypeOf(result.typeUrl).toEqualTypeOf<'/test.pkg.MsgAddData'>();
    expectTypeOf(result.msg).toEqualTypeOf<MockMsg>();
    expectTypeOf(result.value).toEqualTypeOf<Uint8Array>();
  });

  it('result has only the expected message helper keys', () => {
    expectTypeOf(helpers).toHaveProperty('AddData');
    expectTypeOf(helpers).toHaveProperty('UpdateParams');
    expectTypeOf(helpers).toHaveProperty('GetNode');
  });

  it('query helper has correct types', () => {
    expectTypeOf(helpers.GetNode.path).toBeString();
  });

  it('typeof helper.typeUrl can be used as a discriminant', () => {
    // This is the exact pattern the SDK uses for DecodedMessage
    type TestUnion =
      | { kind: typeof helpers.AddData.typeUrl; msg: MockMsg }
      | { kind: typeof helpers.UpdateParams.typeUrl; msg: MockMsgResponse };

    const value = { kind: helpers.AddData.typeUrl, msg: { name: 'x', value: 1 } } as TestUnion;

    if (value.kind === helpers.AddData.typeUrl) {
      // If narrowing works, msg is MockMsg here (has .name and .value)
      expectTypeOf(value.msg).toEqualTypeOf<MockMsg>();
    }
  });
});

// ---------------------------------------------------------------------------
// Discriminated union narrowing — the exact SDK pattern
// ---------------------------------------------------------------------------

describe('defineProto — discriminated union narrowing', () => {
  // Second set of mock types to distinguish from the first
  interface MockMsgB { amount: number; denom: string }
  const MockMsgBCodec = {
    encode(message: MockMsgB) {
      return { finish: () => new TextEncoder().encode(JSON.stringify(message)) };
    },
    decode(input: Uint8Array): MockMsgB {
      return JSON.parse(new TextDecoder().decode(input));
    },
    fromPartial(partial: Partial<MockMsgB>): MockMsgB {
      return { amount: partial.amount ?? 0, denom: partial.denom ?? '' };
    },
  };

  const helpers = defineProto({
    MsgAddData: MockMsgCodec,
    MsgAddDataResponse: MockMsgResponseCodec,
    MsgTransfer: MockMsgBCodec,
  }, 'test.pkg');

  // Build a discriminated union exactly like the SDK does
  type DecodedMessage =
    | { messageType: typeof helpers.AddData.typeUrl; message: MockMsg }
    | { messageType: typeof helpers.Transfer.typeUrl; message: MockMsgB };

  it('narrows to correct branch when checking messageType with helper constant', () => {
    const msg: DecodedMessage = {
      messageType: helpers.AddData.typeUrl,
      message: { name: 'hello', value: 42 },
    };

    if (msg.messageType === helpers.AddData.typeUrl) {
      // TypeScript narrows msg.message to MockMsg
      expect(msg.message.name).toBe('hello');
      expect(msg.message.value).toBe(42);
      expectTypeOf(msg.message).toEqualTypeOf<MockMsg>();
    }
  });

  it('narrows to correct branch when checking messageType with string literal', () => {
    const msg: DecodedMessage = {
      messageType: '/test.pkg.MsgTransfer' as typeof helpers.Transfer.typeUrl,
      message: { amount: 100, denom: 'urebar' },
    };

    if (msg.messageType === '/test.pkg.MsgTransfer') {
      expect(msg.message.amount).toBe(100);
      expectTypeOf(msg.message).toEqualTypeOf<MockMsgB>();
    }
  });

  it('exhaustive switch over all message types', () => {
    function handle(msg: DecodedMessage): string {
      switch (msg.messageType) {
        case helpers.AddData.typeUrl:
          return msg.message.name;
        case helpers.Transfer.typeUrl:
          return msg.message.denom;
        default: {
          // If the union is exhaustive, this should be unreachable.
          // TypeScript narrows msg to `never` here.
          const _exhaustive: never = msg;
          return _exhaustive;
        }
      }
    }

    expect(handle({
      messageType: helpers.AddData.typeUrl,
      message: { name: 'test', value: 0 },
    })).toBe('test');

    expect(handle({
      messageType: helpers.Transfer.typeUrl,
      message: { amount: 50, denom: 'urebar' },
    })).toBe('urebar');
  });
});

// ---------------------------------------------------------------------------
// Property-based / fuzz tests — randomized codec sets
// ---------------------------------------------------------------------------

describe('defineProto — property-based tests', () => {
  /** Create a minimal JSON codec for any object shape with given defaults. */
  function makeCodec<T extends Record<string, any>>(defaults: T) {
    return {
      encode(message: T) {
        return { finish: () => new TextEncoder().encode(JSON.stringify(message)) };
      },
      decode(input: Uint8Array): T {
        return JSON.parse(new TextDecoder().decode(input));
      },
      fromPartial(partial: Partial<T>): T {
        return { ...defaults, ...partial };
      },
    };
  }

  // Generate a variety of message names to test pattern matching
  const messageNames = [
    'AddData', 'CreateInput', 'CreateCalculated', 'UpdateParams',
    'CompleteTriggerAction', 'Recalculate', 'RunCalculation',
    'CreateFunction', 'Transfer', 'Delegate', 'Undelegate',
    'A',          // single character
    'X1',         // with digit
    'FooBarBaz',  // triple camelCase
  ];

  it('typeUrl follows /${prefix}.Msg${Name} for all message names', () => {
    const prefix = 'cosmos.bank.v1beta1';

    for (const name of messageNames) {
      const codecs: Record<string, any> = {
        [`Msg${name}`]: makeCodec({ id: '' }),
      };
      const helpers = defineProto(codecs, prefix);
      expect(helpers[name].typeUrl).toBe(`/${prefix}.Msg${name}`);
    }
  });

  it('typeUrl is correct across varied prefixes', () => {
    const prefixes = [
      'rebar.rebar',
      'cosmos.bank.v1beta1',
      'ibc.core.channel.v1',
      'a',
      'a.b.c.d.e.f',
    ];

    for (const prefix of prefixes) {
      const helpers = defineProto({ MsgSend: makeCodec({ to: '' }) }, prefix);
      expect(helpers.Send.typeUrl).toBe(`/${prefix}.MsgSend`);
    }
  });

  it('encode/decode roundtrip preserves data for randomized messages', () => {
    const codec = makeCodec({ x: 0, y: '', z: false });
    const helpers = defineProto({ MsgTest: codec }, 'fuzz');

    for (let i = 0; i < 100; i++) {
      const msg = {
        x: Math.random() * 1e9 | 0,
        y: Math.random().toString(36).slice(2),
        z: Math.random() > 0.5,
      };
      const encoded = helpers.Test(msg);
      const decoded = helpers.Test.decode(encoded.value);
      expect(decoded).toEqual(msg);
    }
  });

  it('only Msg-prefixed codecs produce helpers (non-Msg entries are dropped)', () => {
    const codec = makeCodec({ v: '' });
    const helpers = defineProto({
      MsgSend: codec,
      NotAMsg: codec,
      Send: codec,
      MsgSendResponse: codec,
      protobufPackage: 'x' as any,
      '': codec as any,
    }, 'test');

    // Only MsgSend (stripped to "Send") should exist
    expect(helpers.Send).toBeDefined();
    expect(helpers.Send.typeUrl).toBe('/test.MsgSend');

    // Everything else should NOT create a helper
    expect((helpers as any).NotAMsg).toBeUndefined();
    expect((helpers as any).protobufPackage).toBeUndefined();
    expect((helpers as any)['']).toBeUndefined();
  });

  it('handles large codec sets without issues', () => {
    const codecs: Record<string, any> = {};
    const count = 50;
    for (let i = 0; i < count; i++) {
      codecs[`MsgType${i}`] = makeCodec({ id: i });
      codecs[`MsgType${i}Response`] = makeCodec({ ok: true });
    }

    const helpers = defineProto(codecs, 'stress');

    for (let i = 0; i < count; i++) {
      expect(helpers[`Type${i}`].typeUrl).toBe(`/stress.MsgType${i}`);
      expect(typeof helpers[`Type${i}`].decodeResponse).toBe('function');
    }
  });

  it('response pairing is correct when codecs are interleaved', () => {
    const msgCodec = makeCodec({ data: '' });
    const respCodec = makeCodec({ result: '' });

    // Deliberately interleave order
    const helpers = defineProto({
      MsgBetaResponse: respCodec,
      MsgAlpha: msgCodec,
      MsgAlphaResponse: respCodec,
      MsgBeta: msgCodec,
      MsgGamma: msgCodec, // no response
    }, 'test');

    expect(typeof helpers.Alpha.decodeResponse).toBe('function');
    expect(typeof helpers.Beta.decodeResponse).toBe('function');
    expect(helpers.Gamma.decodeResponse).toBeUndefined();
  });

  it('query helpers only appear when both Request and Response exist', () => {
    const codec = makeCodec({ id: '' });

    // Orphan response (no matching request) should be silently ignored
    const helpers = defineProto({
      QueryGetNodeRequest: codec,
      QueryGetNodeResponse: codec,
      QueryOrphanResponse: codec, // no matching request
    }, 'test');

    expect(helpers.GetNode).toBeDefined();
    expect((helpers as any).Orphan).toBeUndefined();
    expect((helpers as any).OrphanResponse).toBeUndefined();
  });

  it('empty codec record produces empty result', () => {
    const helpers = defineProto({}, 'test');
    expect(Object.keys(helpers)).toHaveLength(0);
  });
});

