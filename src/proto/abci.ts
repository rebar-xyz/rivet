import { Writer, Reader } from './wire.js';
import type { Any } from './any.js';
import { Any as AnyCodec } from './any.js';

/** cosmos.base.abci.v1beta1.TxMsgData */
export interface TxMsgData {
  msgResponses: Any[];
}

export const TxMsgData = {
  encode(msg: TxMsgData): Uint8Array {
    const w = new Writer();
    for (const resp of msg.msgResponses) {
      w.field(2, AnyCodec.encode(resp));
    }
    return w.finish();
  },

  decode(data: Uint8Array): TxMsgData {
    const r = new Reader(data);
    const msgResponses: Any[] = [];

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        // field 1 was deprecated `data` field
        case 1: r.readBytes(); break;
        case 2: msgResponses.push(AnyCodec.decode(r.readBytes())); break;
        default: r.skip(wire);
      }
    }
    return { msgResponses };
  },

  fromPartial(partial: Partial<TxMsgData>): TxMsgData {
    return { msgResponses: partial.msgResponses ?? [] };
  },
};

/** cosmos.base.abci.v1beta1.GasInfo */
export interface GasInfo {
  gasWanted: bigint;
  gasUsed: bigint;
}

/** cosmos.base.abci.v1beta1.Result */
export interface Result {
  data: Uint8Array;
  log: string;
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
  msgResponses: Any[];
}

export const Result = {
  decode(data: Uint8Array): Result {
    const r = new Reader(data);
    let resultData = new Uint8Array(0);
    let log = '';
    const events: Result['events'] = [];
    const msgResponses: Any[] = [];

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        case 1: resultData = r.readBytes(); break;
        case 2: log = r.readString(); break;
        case 3: {
          const eventReader = new Reader(r.readBytes());
          let type = '';
          const attributes: Array<{ key: string; value: string }> = [];
          while (!eventReader.done) {
            const [ef, ew] = eventReader.readTag();
            switch (ef) {
              case 1: type = eventReader.readString(); break;
              case 2: {
                const attrReader = new Reader(eventReader.readBytes());
                let key = '', value = '';
                while (!attrReader.done) {
                  const [af, aw] = attrReader.readTag();
                  switch (af) {
                    case 1: key = attrReader.readString(); break;
                    case 2: value = attrReader.readString(); break;
                    default: attrReader.skip(aw);
                  }
                }
                attributes.push({ key, value });
                break;
              }
              default: eventReader.skip(ew);
            }
          }
          events.push({ type, attributes });
          break;
        }
        case 4: msgResponses.push(AnyCodec.decode(r.readBytes())); break;
        default: r.skip(wire);
      }
    }
    return { data: resultData, log, events, msgResponses };
  },
};

/** cosmos.tx.v1beta1.SimulateResponse (via ABCI query) */
export interface SimulateResponse {
  gasInfo?: GasInfo;
  result?: Result;
}

export const SimulateResponse = {
  decode(data: Uint8Array): SimulateResponse {
    const r = new Reader(data);
    let gasInfo: GasInfo | undefined;
    let result: Result | undefined;

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        case 1: {
          const inner = new Reader(r.readBytes());
          let gasWanted = 0n;
          let gasUsed = 0n;
          while (!inner.done) {
            const [f, w] = inner.readTag();
            switch (f) {
              case 1: gasWanted = inner.readVarint64(); break;
              case 2: gasUsed = inner.readVarint64(); break;
              default: inner.skip(w);
            }
          }
          gasInfo = { gasWanted, gasUsed };
          break;
        }
        case 2: {
          result = Result.decode(r.readBytes());
          break;
        }
        default: r.skip(wire);
      }
    }
    return { gasInfo, result };
  },
};

/** cosmos.tx.v1beta1.SimulateRequest */
export const SimulateRequest = {
  encode(txBytes: Uint8Array): Uint8Array {
    const w = new Writer();
    // field 2 = tx_bytes (bytes)
    w.fieldBytes(2, txBytes);
    return w.finish();
  },
};
