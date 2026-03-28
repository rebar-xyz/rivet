import { Tx, TxBody, AuthInfo } from '../proto/tx.js';
import { TxMsgData } from '../proto/abci.js';
import type { Any } from '../proto/any.js';

/** Decode raw transaction bytes into structured Tx. */
export function decodeTx(txBytes: Uint8Array): {
  body?: TxBody;
  authInfo?: AuthInfo;
  signatures: Uint8Array[];
} {
  return Tx.decode(txBytes);
}

/** Decode TxMsgData from response data bytes. Returns the msgResponses array. */
export function decodeTxMsgData(data: Uint8Array): { msgResponses: Any[] } {
  return TxMsgData.decode(data);
}
