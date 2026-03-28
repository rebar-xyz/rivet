import { Writer, Reader } from './wire.js';

/** cosmos.crypto.secp256k1.PubKey */
export interface PubKey {
  key: Uint8Array;
}

export const PubKey = {
  typeUrl: '/cosmos.crypto.secp256k1.PubKey',

  encode(msg: PubKey): Uint8Array {
    const w = new Writer();
    w.fieldBytes(1, msg.key);
    return w.finish();
  },

  decode(data: Uint8Array): PubKey {
    const r = new Reader(data);
    let key = new Uint8Array(0);

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        case 1: key = r.readBytes(); break;
        default: r.skip(wire);
      }
    }
    return { key };
  },

  fromPartial(partial: Partial<PubKey>): PubKey {
    return { key: partial.key ? new Uint8Array(partial.key) : new Uint8Array(0) };
  },
};
