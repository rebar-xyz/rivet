import { TxRaw } from '../proto/tx.js';
import type { Any } from '../proto/any.js';

/** Encode a signed transaction into the final wire format for broadcasting. */
export function encodeTxRaw(
  bodyBytes: Uint8Array,
  authInfoBytes: Uint8Array,
  signatures: Uint8Array[],
): Uint8Array {
  return TxRaw.encode({ bodyBytes, authInfoBytes, signatures });
}

/**
 * Encode a message into Any format using a provided encoder.
 * Used to encode chain-specific messages before passing to Rivet.
 */
export function encodeMessage(
  typeUrl: string,
  encoder: { encode: (msg: unknown) => { finish(): Uint8Array }; fromPartial: (obj: unknown) => unknown },
  partial: unknown,
): Any {
  const msg = encoder.fromPartial(partial);
  const value = encoder.encode(msg).finish();
  return { typeUrl, value };
}
