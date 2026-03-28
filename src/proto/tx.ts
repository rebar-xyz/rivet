import { Writer, Reader } from './wire.js';
import type { Any } from './any.js';
import { Any as AnyCodec } from './any.js';
import type { Coin } from './coin.js';
import { Coin as CoinCodec } from './coin.js';

// -- SignMode ----------------------------------------------------------------

export const SignMode = {
  UNSPECIFIED: 0,
  DIRECT: 1,
} as const;

export type SignMode = (typeof SignMode)[keyof typeof SignMode];

// -- ModeInfo ----------------------------------------------------------------

export interface ModeInfo {
  single?: { mode: SignMode };
}

function encodeModeInfo(msg: ModeInfo): Uint8Array {
  const w = new Writer();
  if (msg.single) {
    // field 1 = single (message)
    const inner = new Writer();
    inner.fieldVarint(1, msg.single.mode);
    w.field(1, inner.finish());
  }
  return w.finish();
}

function decodeModeInfo(data: Uint8Array): ModeInfo {
  const r = new Reader(data);
  const result: ModeInfo = {};

  while (!r.done) {
    const [field, wire] = r.readTag();
    switch (field) {
      case 1: {
        const inner = new Reader(r.readBytes());
        const single: { mode: SignMode } = { mode: SignMode.UNSPECIFIED };
        while (!inner.done) {
          const [f, w] = inner.readTag();
          switch (f) {
            case 1: single.mode = inner.readVarint32() as SignMode; break;
            default: inner.skip(w);
          }
        }
        result.single = single;
        break;
      }
      default: r.skip(wire);
    }
  }
  return result;
}

// -- SignerInfo ---------------------------------------------------------------

export interface SignerInfo {
  publicKey?: Any;
  modeInfo?: ModeInfo;
  sequence: bigint;
}

function encodeSignerInfo(msg: SignerInfo): Uint8Array {
  const w = new Writer();
  if (msg.publicKey) {
    w.field(1, AnyCodec.encode(msg.publicKey));
  }
  if (msg.modeInfo) {
    w.field(2, encodeModeInfo(msg.modeInfo));
  }
  w.fieldVarint(3, msg.sequence);
  return w.finish();
}

function decodeSignerInfo(data: Uint8Array): SignerInfo {
  const r = new Reader(data);
  const result: SignerInfo = { sequence: 0n };

  while (!r.done) {
    const [field, wire] = r.readTag();
    switch (field) {
      case 1: result.publicKey = AnyCodec.decode(r.readBytes()); break;
      case 2: result.modeInfo = decodeModeInfo(r.readBytes()); break;
      case 3: result.sequence = r.readVarint64(); break;
      default: r.skip(wire);
    }
  }
  return result;
}

// -- Fee ---------------------------------------------------------------------

export interface Fee {
  amount: Coin[];
  gasLimit: bigint;
  payer?: string;
  granter?: string;
}

function encodeFee(msg: Fee): Uint8Array {
  const w = new Writer();
  for (const coin of msg.amount) {
    w.field(1, CoinCodec.encode(coin));
  }
  // Always write gasLimit even if 0 - Cosmos SDK expects Fee to be present
  // in AuthInfo and accesses gasLimit without nil-checking
  w.tag(2, 0).uint64(msg.gasLimit);
  if (msg.payer) w.fieldString(3, msg.payer);
  if (msg.granter) w.fieldString(4, msg.granter);
  return w.finish();
}

function decodeFee(data: Uint8Array): Fee {
  const r = new Reader(data);
  const amount: Coin[] = [];
  let gasLimit = 0n;
  let payer = '';
  let granter = '';

  while (!r.done) {
    const [field, wire] = r.readTag();
    switch (field) {
      case 1: amount.push(CoinCodec.decode(r.readBytes())); break;
      case 2: gasLimit = r.readVarint64(); break;
      case 3: payer = r.readString(); break;
      case 4: granter = r.readString(); break;
      default: r.skip(wire);
    }
  }
  return { amount, gasLimit, payer, granter };
}

// -- TxBody ------------------------------------------------------------------

export interface TxBody {
  messages: Any[];
  memo: string;
  timeoutHeight: bigint;
  extensionOptions: Any[];
  nonCriticalExtensionOptions: Any[];
  unordered: boolean;
  timeoutTimestamp?: Date;
}

export const TxBody = {
  encode(msg: TxBody): Uint8Array {
    const w = new Writer();
    for (const m of msg.messages) {
      w.field(1, AnyCodec.encode(m));
    }
    w.fieldString(2, msg.memo);
    w.fieldVarint(3, msg.timeoutHeight);
    for (const ext of msg.extensionOptions) {
      w.field(1023, AnyCodec.encode(ext));
    }
    for (const ext of msg.nonCriticalExtensionOptions) {
      w.field(2047, AnyCodec.encode(ext));
    }
    w.fieldBool(4, msg.unordered);
    if (msg.timeoutTimestamp) {
      // Encode as google.protobuf.Timestamp (submessage with seconds + nanos)
      const timestampWriter = new Writer();
      const ms = msg.timeoutTimestamp.getTime();
      const seconds = BigInt(Math.floor(ms / 1000));
      const nanos = (ms % 1000) * 1_000_000;
      timestampWriter.fieldVarint(1, seconds);  // field 1 = seconds
      timestampWriter.fieldVarint(2, nanos);    // field 2 = nanos
      w.field(5, timestampWriter.finish());
    }
    return w.finish();
  },

  decode(data: Uint8Array): TxBody {
    const r = new Reader(data);
    const messages: Any[] = [];
    let memo = '';
    let timeoutHeight = 0n;
    const extensionOptions: Any[] = [];
    const nonCriticalExtensionOptions: Any[] = [];
    let unordered = false;
    let timeoutTimestamp: Date | undefined;

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        case 1: messages.push(AnyCodec.decode(r.readBytes())); break;
        case 2: memo = r.readString(); break;
        case 3: timeoutHeight = r.readVarint64(); break;
        case 4: unordered = r.readBool(); break;
        case 5: {
          // Decode google.protobuf.Timestamp submessage
          const timestampBytes = r.readBytes();
          const tr = new Reader(timestampBytes);
          let seconds = 0n;
          let nanos = 0;
          while (!tr.done) {
            const [tf] = tr.readTag();
            switch (tf) {
              case 1: seconds = tr.readVarint64(); break;
              case 2: nanos = tr.readVarint32(); break;
              default: tr.skip(tf);
            }
          }
          timeoutTimestamp = new Date(Number(seconds) * 1000 + Math.floor(nanos / 1_000_000));
          break;
        }
        case 1023: extensionOptions.push(AnyCodec.decode(r.readBytes())); break;
        case 2047: nonCriticalExtensionOptions.push(AnyCodec.decode(r.readBytes())); break;
        default: r.skip(wire);
      }
    }
    return { messages, memo, timeoutHeight, extensionOptions, nonCriticalExtensionOptions, unordered, timeoutTimestamp };
  },

  fromPartial(partial: Partial<TxBody>): TxBody {
    return {
      messages: partial.messages ?? [],
      memo: partial.memo ?? '',
      timeoutHeight: partial.timeoutHeight ?? 0n,
      extensionOptions: partial.extensionOptions ?? [],
      nonCriticalExtensionOptions: partial.nonCriticalExtensionOptions ?? [],
      unordered: partial.unordered ?? false,
      timeoutTimestamp: partial.timeoutTimestamp,
    };
  },
};

// -- AuthInfo ----------------------------------------------------------------

export interface AuthInfo {
  signerInfos: SignerInfo[];
  fee?: Fee;
}

export const AuthInfo = {
  encode(msg: AuthInfo): Uint8Array {
    const w = new Writer();
    for (const si of msg.signerInfos) {
      w.field(1, encodeSignerInfo(si));
    }
    if (msg.fee) {
      w.field(2, encodeFee(msg.fee));
    }
    return w.finish();
  },

  decode(data: Uint8Array): AuthInfo {
    const r = new Reader(data);
    const signerInfos: SignerInfo[] = [];
    let fee: Fee | undefined;

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        case 1: signerInfos.push(decodeSignerInfo(r.readBytes())); break;
        case 2: fee = decodeFee(r.readBytes()); break;
        default: r.skip(wire);
      }
    }
    return { signerInfos, fee };
  },

  fromPartial(partial: Partial<AuthInfo>): AuthInfo {
    return {
      signerInfos: partial.signerInfos ?? [],
      fee: partial.fee,
    };
  },
};

// -- SignDoc ------------------------------------------------------------------

export interface SignDoc {
  bodyBytes: Uint8Array;
  authInfoBytes: Uint8Array;
  chainId: string;
  accountNumber: bigint;
}

export const SignDoc = {
  encode(msg: SignDoc): Uint8Array {
    const w = new Writer();
    w.fieldBytes(1, msg.bodyBytes);
    w.fieldBytes(2, msg.authInfoBytes);
    w.fieldString(3, msg.chainId);
    w.fieldVarint(4, msg.accountNumber);
    return w.finish();
  },

  decode(data: Uint8Array): SignDoc {
    const r = new Reader(data);
    let bodyBytes = new Uint8Array(0);
    let authInfoBytes = new Uint8Array(0);
    let chainId = '';
    let accountNumber = 0n;

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        case 1: bodyBytes = r.readBytes(); break;
        case 2: authInfoBytes = r.readBytes(); break;
        case 3: chainId = r.readString(); break;
        case 4: accountNumber = r.readVarint64(); break;
        default: r.skip(wire);
      }
    }
    return { bodyBytes, authInfoBytes, chainId, accountNumber };
  },

  fromPartial(partial: Partial<SignDoc>): SignDoc {
    return {
      bodyBytes: partial.bodyBytes ?? new Uint8Array(0),
      authInfoBytes: partial.authInfoBytes ?? new Uint8Array(0),
      chainId: partial.chainId ?? '',
      accountNumber: partial.accountNumber ?? 0n,
    };
  },
};

// -- TxRaw -------------------------------------------------------------------

export interface TxRaw {
  bodyBytes: Uint8Array;
  authInfoBytes: Uint8Array;
  signatures: Uint8Array[];
}

export const TxRaw = {
  encode(msg: TxRaw): Uint8Array {
    const w = new Writer();
    w.fieldBytes(1, msg.bodyBytes);
    w.fieldBytes(2, msg.authInfoBytes);
    for (const sig of msg.signatures) {
      w.fieldBytes(3, sig);
    }
    return w.finish();
  },

  decode(data: Uint8Array): TxRaw {
    const r = new Reader(data);
    let bodyBytes = new Uint8Array(0);
    let authInfoBytes = new Uint8Array(0);
    const signatures: Uint8Array[] = [];

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        case 1: bodyBytes = r.readBytes(); break;
        case 2: authInfoBytes = r.readBytes(); break;
        case 3: signatures.push(r.readBytes()); break;
        default: r.skip(wire);
      }
    }
    return { bodyBytes, authInfoBytes, signatures };
  },

  fromPartial(partial: Partial<TxRaw>): TxRaw {
    return {
      bodyBytes: partial.bodyBytes ?? new Uint8Array(0),
      authInfoBytes: partial.authInfoBytes ?? new Uint8Array(0),
      signatures: partial.signatures ?? [],
    };
  },
};

// -- Tx (decoded transaction) -------------------------------------------------

export interface Tx {
  body?: TxBody;
  authInfo?: AuthInfo;
  signatures: Uint8Array[];
}

export const Tx = {
  encode(msg: Tx): Uint8Array {
    const w = new Writer();
    if (msg.body) {
      w.field(1, TxBody.encode(msg.body));
    }
    if (msg.authInfo) {
      w.field(2, AuthInfo.encode(msg.authInfo));
    }
    for (const sig of msg.signatures) {
      w.fieldBytes(3, sig);
    }
    return w.finish();
  },

  decode(data: Uint8Array): Tx {
    const r = new Reader(data);
    let body: TxBody | undefined;
    let authInfo: AuthInfo | undefined;
    const signatures: Uint8Array[] = [];

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        case 1: body = TxBody.decode(r.readBytes()); break;
        case 2: authInfo = AuthInfo.decode(r.readBytes()); break;
        case 3: signatures.push(r.readBytes()); break;
        default: r.skip(wire);
      }
    }
    return { body, authInfo, signatures };
  },

  fromPartial(partial: Partial<Tx>): Tx {
    return {
      body: partial.body,
      authInfo: partial.authInfo,
      signatures: partial.signatures ?? [],
    };
  },
};
