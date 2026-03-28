import { Writer, Reader } from './wire.js';
import type { Any } from './any.js';
import { Any as AnyCodec } from './any.js';

/** cosmos.auth.v1beta1.BaseAccount */
export interface BaseAccount {
  address: string;
  pubKey?: Any;
  accountNumber: bigint;
  sequence: bigint;
}

export const BaseAccount = {
  decode(data: Uint8Array): BaseAccount {
    const r = new Reader(data);
    let address = '';
    let pubKey: Any | undefined;
    let accountNumber = 0n;
    let sequence = 0n;

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        case 1: address = r.readString(); break;
        case 2: pubKey = AnyCodec.decode(r.readBytes()); break;
        case 3: accountNumber = r.readVarint64(); break;
        case 4: sequence = r.readVarint64(); break;
        default: r.skip(wire);
      }
    }
    return { address, pubKey, accountNumber, sequence };
  },
};

const BASE_ACCOUNT_TYPE_URL = '/cosmos.auth.v1beta1.BaseAccount';

/**
 * cosmos.auth.v1beta1.QueryAccountResponse
 *
 * The response wraps the account in an Any (field 1). Only BaseAccount
 * is supported; other account types (EthAccount, vesting) are rejected.
 */
export const QueryAccountResponse = {
  decode(data: Uint8Array): { account?: BaseAccount } {
    const r = new Reader(data);
    let account: BaseAccount | undefined;

    while (!r.done) {
      const [field, wire] = r.readTag();
      switch (field) {
        case 1: {
          const any = AnyCodec.decode(r.readBytes());
          if (any.typeUrl && any.typeUrl !== BASE_ACCOUNT_TYPE_URL) {
            throw new Error(`Unsupported account type: ${any.typeUrl}. Only BaseAccount is supported.`);
          }
          account = BaseAccount.decode(any.value);
          break;
        }
        default: r.skip(wire);
      }
    }
    return { account };
  },
};

/** cosmos.auth.v1beta1.QueryAccountRequest */
export const QueryAccountRequest = {
  encode(address: string): Uint8Array {
    const w = new Writer();
    w.fieldString(1, address);
    return w.finish();
  },
};
