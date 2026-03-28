import { decodeTxMsgData } from './tx/decode.js';
import type { TxResponse, BroadcastSyncResponse } from './types.js';
import type { Any } from './proto/any.js';
import type { QueryClient } from './types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Minimal codec shape accepted by defineProto.
 * Matches ts-proto MessageFns<T> and cosmjs-types generated codecs.
 */
export interface MinimalCodec {
  encode(message: any, ...args: any[]): { finish(): Uint8Array };
  decode(input: any, ...args: any[]): any;
  fromPartial(object: any): any;
  typeUrl?: string;
}

/** A typed message helper produced by defineProto for a Msg codec pair. */
export interface MessageHelper<T, R = unknown, TypeUrl extends string = string> {
  /** Encode a partial message into Any format (typeUrl + protobuf bytes). */
  (partial: Partial<T>): { readonly typeUrl: TypeUrl; readonly value: Uint8Array; readonly msg: T };

  /** The protobuf type URL for this message. */
  readonly typeUrl: TypeUrl;

  /** Raw protobuf encode (passthrough to codec). */
  encode(message: T, ...args: any[]): { finish(): Uint8Array };
  /** Raw protobuf decode (passthrough to codec). */
  decode(input: Uint8Array | any, length?: number): T;
  /** Construct a message with defaults filled in (passthrough to codec). */
  fromPartial(partial: Partial<T>): T;

  /**
   * Decode from a signAndBroadcast result.
   * Unwraps TxMsgData, finds the first matching response, and decodes it.
   * Only present when a Msg${X}Response codec exists.
   */
  decodeResponse?(result: BroadcastResult): R;

  /**
   * Decode all matching responses from a batch signAndBroadcast result.
   * Only present when a Msg${X}Response codec exists.
   */
  decodeBatchResponse?(result: BroadcastResult): R[];
}

/** A typed query helper produced by defineProto for a Query codec pair. */
export interface QueryHelper<Req, Resp> {
  /** Execute the query: encode request, transport to chain, decode response. */
  (client: QueryClient, params: Partial<Req>): Promise<Resp>;

  /** The ABCI query path (e.g. "/cosmos.bank.v1beta1.Query/Balance"). */
  readonly path: string;
}

/** The shape returned by signAndBroadcast. */
type BroadcastResult = {
  broadcastResponse: TxResponse | BroadcastSyncResponse;
};

// ---------------------------------------------------------------------------
// Mapped return type for defineProto
// ---------------------------------------------------------------------------

/** Infer the decoded message type T from a codec with a decode method. */
type InferCodecType<C> = C extends { decode(...args: any[]): infer T } ? T : unknown;

/** Extract message helper names: Msg${N} (excluding Msg${N}Response) → N */
type MsgNames<T> = {
  [K in keyof T & string]: K extends `Msg${string}Response` ? never
    : K extends `Msg${infer N}` ? N
    : never;
}[keyof T & string];

/** Extract query helper names: paired Query${N}Request + Query${N}Response → N (skips underscore keys) */
type QueryNames<T> = {
  [K in keyof T & string]: K extends `Query${infer N}Request`
    ? (K extends `${string}_${string}` ? never
       : `Query${N}Response` extends keyof T ? N : never)
    : never;
}[keyof T & string];

/**
 * Computed return type of defineProto.
 * Maps a codec record to typed MessageHelper and QueryHelper objects,
 * preserving literal typeUrl strings for discriminated union narrowing.
 *
 * When a Msg${N}Response codec is present, decodeResponse/decodeBatchResponse
 * are required (non-optional) on the helper. Otherwise they're absent.
 */
export type DefineProtoResult<T extends Record<string, any>, P extends string> = {
  [N in MsgNames<T>]: `Msg${N}Response` extends keyof T
    ? MessageHelper<InferCodecType<T[`Msg${N}`]>, InferCodecType<T[`Msg${N}Response`]>, `/${P}.Msg${N}`> & {
        decodeResponse(result: BroadcastResult): InferCodecType<T[`Msg${N}Response`]>;
        decodeBatchResponse(result: BroadcastResult): InferCodecType<T[`Msg${N}Response`]>[];
      }
    : MessageHelper<InferCodecType<T[`Msg${N}`]>, unknown, `/${P}.Msg${N}`>;
} & {
  [N in Exclude<QueryNames<T>, MsgNames<T>>]: QueryHelper<
    InferCodecType<T[`Query${N}Request`]>,
    InferCodecType<T[`Query${N}Response`]>
  >;
};

// ---------------------------------------------------------------------------
// defineProto
// ---------------------------------------------------------------------------

/**
 * Create typed message and query helpers from protobuf codecs.
 *
 * Scans keys of the passed record and classifies by naming convention:
 * - `Msg${X}` → message helper named `X` (callable encoder + typeUrl + decode)
 * - `Msg${X}Response` → paired to `X` for response decoding
 * - `Query${X}Request` + `Query${X}Response` → query helper named `X`
 * - Everything else → silently skipped
 *
 * @param codecs Record of codec objects (ts-proto MessageFns or cosmjs-types).
 * @param prefix protobufPackage string (e.g. "cosmos.bank.v1beta1").
 */
export function defineProto<
  T extends Record<string, any>,
  P extends string,
>(codecs: T, prefix: P): DefineProtoResult<T, P>;
export function defineProto(
  codecs: Record<string, any>,
  prefix?: string,
): Record<string, any> {
  const result: Record<string, any> = {};

  // First pass: classify all codecs
  const msgCodecs = new Map<string, any>();       // X → MsgX codec
  const msgRespCodecs = new Map<string, any>();    // X → MsgXResponse codec
  const queryReqCodecs = new Map<string, any>();   // X → QueryXRequest codec
  const queryRespCodecs = new Map<string, any>();  // X → QueryXResponse codec

  for (const [key, codec] of Object.entries(codecs)) {
    if (!isCodec(codec)) continue;

    // Match Query${X}Response first (before Query${X}Request, since "Request" also contains letters)
    const qRespMatch = key.match(/^Query(.+)Response$/);
    if (qRespMatch && !key.includes('_')) {
      queryRespCodecs.set(qRespMatch[1], codec);
      continue;
    }

    const qReqMatch = key.match(/^Query(.+)Request$/);
    if (qReqMatch && !key.includes('_')) {
      queryReqCodecs.set(qReqMatch[1], codec);
      continue;
    }

    // Match Msg${X}Response before Msg${X}
    const msgRespMatch = key.match(/^Msg(.+)Response$/);
    if (msgRespMatch) {
      msgRespCodecs.set(msgRespMatch[1], codec);
      continue;
    }

    const msgMatch = key.match(/^Msg(.+)$/);
    if (msgMatch) {
      msgCodecs.set(msgMatch[1], codec);
      continue;
    }
  }

  // Validate: query requests must have matching responses
  for (const name of queryReqCodecs.keys()) {
    if (!queryRespCodecs.has(name)) {
      throw new Error(
        `Query${name}Request has no matching Query${name}Response. All query requests must be paired.`,
      );
    }
  }

  // Build message helpers
  for (const [name, codec] of msgCodecs) {
    const key = `Msg${name}`;
    const typeUrl: string =
      codec.typeUrl ?? (prefix ? `/${prefix}.${key}` : undefined)!;
    if (!typeUrl) {
      throw new Error(
        `Cannot derive typeUrl for "${key}": codec has no typeUrl property and no prefix was provided.`,
      );
    }

    const responseCodec = msgRespCodecs.get(name);
    const responseTypeUrl = responseCodec
      ? (responseCodec.typeUrl ?? (prefix ? `/${prefix}.Msg${name}Response` : undefined))
      : undefined;

    const callable = (partial: any) => {
      const msg = codec.fromPartial(partial);
      const value = codec.encode(msg).finish();
      return { typeUrl, value, msg };
    };

    const helper: any = Object.assign(callable, {
      typeUrl,
      encode: (message: any, ...args: any[]) => codec.encode(message, ...args),
      decode: (input: any, length?: number) => codec.decode(input, length),
      fromPartial: (partial: any) => codec.fromPartial(partial),
    });

    // Only add decode/decodeBatch if a response codec exists
    if (responseCodec && responseTypeUrl) {
      helper.decodeResponse = function decodeResponse(broadcastResult: BroadcastResult) {
        const data = extractResponseData(broadcastResult);
        if (!data || data.length === 0) return responseCodec.fromPartial({});
        try {
          const txMsgData = decodeTxMsgData(data);
          const match = txMsgData.msgResponses.find(
            (r: Any) => r.typeUrl === responseTypeUrl,
          );
          return match ? responseCodec.decode(match.value) : responseCodec.fromPartial({});
        } catch {
          return responseCodec.fromPartial({});
        }
      };

      helper.decodeBatchResponse = function decodeBatchResponse(broadcastResult: BroadcastResult) {
        const data = extractResponseData(broadcastResult);
        if (!data || data.length === 0) return [];
        try {
          const txMsgData = decodeTxMsgData(data);
          return txMsgData.msgResponses
            .filter((r: Any) => r.typeUrl === responseTypeUrl)
            .map((r: Any) => responseCodec.decode(r.value));
        } catch {
          return [];
        }
      };
    }

    result[name] = helper;
  }

  // Build query helpers
  for (const [name, reqCodec] of queryReqCodecs) {
    const respCodec = queryRespCodecs.get(name)!;

    // Path: /${prefix}.Query/${name}
    const path = prefix ? `/${prefix}.Query/${name}` : `/Query/${name}`;

    const queryFn = async (client: QueryClient, params: any) => {
      const msg = reqCodec.fromPartial(params);
      const bytes = reqCodec.encode(msg).finish();
      const responseBytes = await client.query(path, bytes);
      return respCodec.decode(responseBytes);
    };

    queryFn.path = path;

    result[name] = result[name] ?? queryFn;
    // If name collision with a message helper (unlikely), message wins
    // since query names strip "Query" and "Request"/"Response" whereas
    // message names strip "Msg" — different namespaces in practice
    if (!msgCodecs.has(name)) {
      result[name] = queryFn;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isCodec(value: unknown): value is MinimalCodec {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.encode === 'function' &&
    typeof v.decode === 'function' &&
    typeof v.fromPartial === 'function'
  );
}

function isConfirmResponse(
  response: BroadcastSyncResponse | TxResponse,
): response is TxResponse {
  return 'tx' in response;
}

function extractResponseData(
  result: BroadcastResult,
): Uint8Array | undefined {
  const resp = result.broadcastResponse;
  if (isConfirmResponse(resp)) {
    return resp.txResult.data;
  }
  return resp.data;
}
