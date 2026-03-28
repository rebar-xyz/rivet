import { TxBody, AuthInfo, SignDoc, SignMode } from '../proto/tx.js';
import type { Any } from '../proto/any.js';
import { PubKey } from '../proto/keys.js';
import type { Coin } from '../proto/coin.js';

/**
 * Build and encode TxBody bytes from messages and options.
 */
export function buildTxBody(
  messages: Any[],
  options?: {
    memo?: string;
    timeoutHeight?: bigint;
    unordered?: boolean;
    timeoutTimestamp?: Date;
  },
): Uint8Array {
  return TxBody.encode({
    messages,
    memo: options?.memo ?? '',
    timeoutHeight: options?.timeoutHeight ?? 0n,
    extensionOptions: [],
    nonCriticalExtensionOptions: [],
    unordered: options?.unordered ?? false,
    timeoutTimestamp: options?.timeoutTimestamp,
  });
}

/**
 * Build and encode AuthInfo bytes from signer info and fee.
 */
export function buildAuthInfo(
  signer: {
    publicKey: Uint8Array;
    sequence: bigint;
    signMode?: SignMode;
  },
  fee: { amount: Coin[]; gasLimit: bigint },
): Uint8Array {
  const pubKeyAny: Any = {
    typeUrl: PubKey.typeUrl,
    value: PubKey.encode({ key: signer.publicKey }),
  };

  return AuthInfo.encode({
    signerInfos: [{
      publicKey: pubKeyAny,
      modeInfo: { single: { mode: signer.signMode ?? SignMode.DIRECT } },
      sequence: signer.sequence,
    }],
    fee: {
      amount: fee.amount,
      gasLimit: fee.gasLimit,
    },
  });
}

/**
 * Build and encode SignDoc bytes ready for hashing and signing.
 */
export function buildSignDoc(
  bodyBytes: Uint8Array,
  authInfoBytes: Uint8Array,
  chainId: string,
  accountNumber: bigint,
): Uint8Array {
  return SignDoc.encode({
    bodyBytes,
    authInfoBytes,
    chainId,
    accountNumber,
  });
}
