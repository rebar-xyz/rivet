import { Writer, Reader } from './wire.js';

/** cosmos.base.v1beta1.Coin */
export interface Coin {
  denom: string;
  amount: string;
}

export const Coin = {
  encode(msg: Coin): Uint8Array {
    const w = new Writer();
    w.fieldString(1, msg.denom);
    w.fieldString(2, msg.amount);
    return w.finish();
  },

  decode(data: Uint8Array): Coin {
    const r = new Reader(data);
    let denom = '';
    let amount = '';

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        case 1: denom = r.readString(); break;
        case 2: amount = r.readString(); break;
        default: r.skip(wire);
      }
    }
    return { denom, amount };
  },

  fromPartial(partial: Partial<Coin>): Coin {
    return {
      denom: partial.denom ?? '',
      amount: partial.amount ?? '0',
    };
  },
};
