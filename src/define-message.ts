import { Writer, Reader } from './proto/wire.js';

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

type ScalarType = 'string' | 'bytes' | 'uint64' | 'int64' | 'uint32' | 'int32' | 'bool' | 'enum';

/** A scalar field definition (string, number, bool, bytes, enum). */
export interface ScalarFieldDef {
  type: ScalarType;
  field: number;
  repeated?: boolean;
}

/** A nested message field definition. */
export interface MessageFieldDef {
  type: 'message';
  field: number;
  repeated?: boolean;
  message: MessageCodec<any>;
}

export type FieldDef = ScalarFieldDef | MessageFieldDef;

// ---------------------------------------------------------------------------
// Codec interface (output of defineMessage, compatible with MinimalCodec)
// ---------------------------------------------------------------------------

/** Codec produced by defineMessage — satisfies MinimalCodec for defineProto. */
export interface MessageCodec<T> {
  typeUrl?: string;
  encode(message: T): { finish(): Uint8Array };
  decode(input: Uint8Array): T;
  fromPartial(partial: Partial<T>): T;
}

// ---------------------------------------------------------------------------
// Type inference from schema
// ---------------------------------------------------------------------------

type ScalarTsType<T extends ScalarType> =
  T extends 'string' ? string :
  T extends 'bytes' ? Uint8Array :
  T extends 'uint64' | 'int64' ? bigint :
  T extends 'uint32' | 'int32' | 'enum' ? number :
  T extends 'bool' ? boolean :
  never;

type FieldTsType<F extends FieldDef> =
  F extends MessageFieldDef
    ? (F['repeated'] extends true
        ? InferCodecMessage<F['message']>[]
        : InferCodecMessage<F['message']>)
    : F extends ScalarFieldDef
      ? (F['repeated'] extends true
          ? ScalarTsType<F['type']>[]
          : ScalarTsType<F['type']>)
      : never;

type InferCodecMessage<C> = C extends MessageCodec<infer T> ? T : never;

/** Infer the TypeScript message type from a schema definition. */
export type InferMessage<S extends Record<string, FieldDef>> = {
  [K in keyof S]: FieldTsType<S[K]>;
};

// ---------------------------------------------------------------------------
// Wire type mapping
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function encodeScalar(w: Writer, fieldNumber: number, type: ScalarType, value: unknown): void {
  switch (type) {
    case 'string': {
      const v = value as string;
      if (v === '') return;
      w.tag(fieldNumber, 2);
      w.string(v);
      break;
    }
    case 'bytes': {
      const v = value as Uint8Array;
      if (v.length === 0) return;
      w.tag(fieldNumber, 2);
      w.bytes(v);
      break;
    }
    case 'uint64': {
      const v = value as bigint;
      if (v === 0n) return;
      w.tag(fieldNumber, 0);
      w.uint64(v);
      break;
    }
    case 'int64': {
      const v = value as bigint;
      if (v === 0n) return;
      w.tag(fieldNumber, 0);
      w.int64(v);
      break;
    }
    case 'uint32': {
      const v = value as number;
      if (v === 0) return;
      w.tag(fieldNumber, 0);
      w.uint32(v);
      break;
    }
    case 'int32': {
      const v = value as number;
      if (v === 0) return;
      // Encode negative int32 as 10-byte two's complement varint (proto3 convention)
      w.tag(fieldNumber, 0);
      if (v < 0) {
        w.int64(BigInt(v));
      } else {
        w.uint32(v);
      }
      break;
    }
    case 'bool': {
      const v = value as boolean;
      if (!v) return;
      w.tag(fieldNumber, 0);
      w.bool(v);
      break;
    }
    case 'enum': {
      const v = value as number;
      if (v === 0) return;
      w.tag(fieldNumber, 0);
      w.uint32(v);
      break;
    }
  }
}

function encodeMessageField(
  w: Writer,
  fieldNumber: number,
  codec: MessageCodec<any>,
  value: unknown,
): void {
  const inner = codec.encode(value as any);
  const bytes = inner instanceof Uint8Array ? inner : inner.finish();
  if (bytes.length === 0) return;
  w.tag(fieldNumber, 2);
  w.bytes(bytes);
}

// ---------------------------------------------------------------------------
// Decoding helpers
// ---------------------------------------------------------------------------

function decodeScalar(r: Reader, type: ScalarType): unknown {
  switch (type) {
    case 'string': return r.readString();
    case 'bytes': return r.readBytes();
    case 'uint64': return r.readVarint64();
    case 'int64': return r.readInt64();
    case 'uint32': return r.readVarint32();
    // Negative int32 is encoded as 10-byte two's complement varint, so
    // we must read as varint64 then truncate to 32-bit signed.
    case 'int32': return Number(BigInt.asIntN(32, r.readVarint64()));
    case 'bool': return r.readBool();
    case 'enum': return r.readVarint32();
  }
}

function decodeMessageField(r: Reader, codec: MessageCodec<any>): unknown {
  const bytes = r.readBytes();
  return codec.decode(bytes);
}

// ---------------------------------------------------------------------------
// Default value helpers
// ---------------------------------------------------------------------------

function defaultScalar(type: ScalarType): unknown {
  switch (type) {
    case 'string': return '';
    case 'bytes': return new Uint8Array(0);
    case 'uint64':
    case 'int64': return 0n;
    case 'uint32':
    case 'int32':
    case 'enum': return 0;
    case 'bool': return false;
  }
}

// ---------------------------------------------------------------------------
// defineMessage
// ---------------------------------------------------------------------------

/**
 * Define a protobuf message codec from a field schema — no code generation needed.
 *
 * The returned codec satisfies MinimalCodec for use with defineProto, and can
 * be used as the `message` reference in other defineMessage schemas.
 *
 * @example
 * ```ts
 * const Coin = defineMessage('/cosmos.base.v1beta1.Coin', {
 *   denom:  { type: 'string', field: 1 },
 *   amount: { type: 'string', field: 2 },
 * });
 *
 * const MsgSend = defineMessage('/cosmos.bank.v1beta1.MsgSend', {
 *   fromAddress: { type: 'string', field: 1 },
 *   toAddress:   { type: 'string', field: 2 },
 *   amount:      { type: 'message', field: 3, repeated: true, message: Coin },
 * });
 * ```
 */
export function defineMessage<S extends Record<string, FieldDef>>(
  typeUrl: string,
  schema: S,
): MessageCodec<InferMessage<S>> & { typeUrl: string } {
  // Pre-build field lookup by field number for decode
  const fieldsByNumber = new Map<number, { name: string; def: FieldDef }>();
  for (const [name, def] of Object.entries(schema)) {
    fieldsByNumber.set(def.field, { name, def });
  }

  // Sort entries by field number for deterministic encoding
  const sortedFields = Object.entries(schema).sort(
    ([, a], [, b]) => a.field - b.field,
  );

  const codec: MessageCodec<InferMessage<S>> & { typeUrl: string } = {
    typeUrl,

    encode(message: InferMessage<S>) {
      const w = new Writer();

      for (const [name, def] of sortedFields) {
        const value = (message as any)[name];

        if (def.repeated) {
          const arr = value as unknown[];
          if (!arr || arr.length === 0) continue;
          // Non-packed repeated (each element gets its own tag)
          for (const item of arr) {
            if (def.type === 'message') {
              encodeMessageField(w, def.field, (def as MessageFieldDef).message, item);
            } else {
              encodeScalar(w, def.field, def.type as ScalarType, item);
            }
          }
        } else if (def.type === 'message') {
          if (value != null) {
            encodeMessageField(w, def.field, (def as MessageFieldDef).message, value);
          }
        } else {
          encodeScalar(w, def.field, def.type as ScalarType, value);
        }
      }

      // Return an object with finish() to match MinimalCodec
      const bytes = w.finish();
      return { finish: () => bytes };
    },

    decode(input: Uint8Array): InferMessage<S> {
      const r = new Reader(input);
      const result: Record<string, unknown> = {};

      // Initialize defaults
      for (const [name, def] of Object.entries(schema)) {
        if (def.repeated) {
          result[name] = [];
        } else if (def.type === 'message') {
          // Singular message fields default to undefined (proto3 semantics)
          // We'll only set them if they appear in the wire data
        } else {
          result[name] = defaultScalar(def.type as ScalarType);
        }
      }

      while (!r.done) {
        const [fieldNumber, wireType] = r.readTag();
        const entry = fieldsByNumber.get(fieldNumber);

        if (!entry) {
          r.skip(wireType);
          continue;
        }

        const { name, def } = entry;
        let decoded: unknown;

        if (def.type === 'message') {
          decoded = decodeMessageField(r, (def as MessageFieldDef).message);
        } else {
          decoded = decodeScalar(r, def.type as ScalarType);
        }

        if (def.repeated) {
          (result[name] as unknown[]).push(decoded);
        } else {
          result[name] = decoded;
        }
      }

      return result as InferMessage<S>;
    },

    fromPartial(partial: Partial<InferMessage<S>>): InferMessage<S> {
      const result: Record<string, unknown> = {};

      for (const [name, def] of Object.entries(schema)) {
        const value = (partial as any)?.[name];

        if (def.repeated) {
          if (Array.isArray(value) && value.length > 0) {
            if (def.type === 'message') {
              result[name] = value.map(
                (item: any) => (def as MessageFieldDef).message.fromPartial(item),
              );
            } else {
              result[name] = [...value];
            }
          } else {
            result[name] = [];
          }
        } else if (def.type === 'message') {
          result[name] = value != null
            ? (def as MessageFieldDef).message.fromPartial(value)
            : undefined;
        } else {
          result[name] = value ?? defaultScalar(def.type as ScalarType);
        }
      }

      return result as InferMessage<S>;
    },
  };

  return codec;
}
