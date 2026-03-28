import type { QueryClient } from '../types.js';
import { QueryAccountRequest, QueryAccountResponse } from '../proto/auth.js';
import { AccountNotFoundError } from '../errors.js';

export interface AccountInfo {
  accountNumber: bigint;
  sequence: bigint;
}

/**
 * Fetch the account number and sequence for an address via ABCI query.
 * Used to populate SignDoc fields before signing.
 */
export async function getAccount(client: QueryClient, address: string): Promise<AccountInfo> {
  const requestBytes = QueryAccountRequest.encode(address);

  const responseBytes = await client.query(
    '/cosmos.auth.v1beta1.Query/Account',
    requestBytes,
  );

  if (responseBytes.length === 0) {
    throw new AccountNotFoundError(address);
  }

  const response = QueryAccountResponse.decode(responseBytes);
  if (!response.account) {
    throw new AccountNotFoundError(address);
  }

  return {
    accountNumber: response.account.accountNumber,
    sequence: response.account.sequence,
  };
}
