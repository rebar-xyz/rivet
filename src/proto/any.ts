import { Writer, Reader } from './wire.js';

/** google.protobuf.Any */
export interface Any {
  typeUrl: string;
  value: Uint8Array;
}

export const Any = {
  encode(msg: Any): Uint8Array {
    const w = new Writer();
    w.fieldString(1, msg.typeUrl);
    w.fieldBytes(2, msg.value);
    return w.finish();
  },

  decode(data: Uint8Array): Any {
    const r = new Reader(data);
    let typeUrl = '';
    let value = new Uint8Array(0);

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        case 1: typeUrl = r.readString(); break;
        case 2: value = r.readBytes(); break;
        default: r.skip(wire);
      }
    }
    return { typeUrl, value };
  },

  fromPartial(partial: Partial<Any>): Any {
    return {
      typeUrl: partial.typeUrl ?? '',
      value: partial.value ? new Uint8Array(partial.value) : new Uint8Array(0),
    };
  },
};
