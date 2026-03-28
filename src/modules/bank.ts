import { defineMessage } from '../define-message.js';
import { defineProto } from '../proto-helpers.js';
import { Coin } from './common.js';

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Input for MsgMultiSend */
export const Input = defineMessage('/cosmos.bank.v1beta1.Input', {
  address: { type: 'string', field: 1 },
  coins: { type: 'message', field: 2, repeated: true, message: Coin },
});

/** Output for MsgMultiSend */
export const Output = defineMessage('/cosmos.bank.v1beta1.Output', {
  address: { type: 'string', field: 1 },
  coins: { type: 'message', field: 2, repeated: true, message: Coin },
});

export const MsgSend = defineMessage('/cosmos.bank.v1beta1.MsgSend', {
  fromAddress: { type: 'string', field: 1 },
  toAddress: { type: 'string', field: 2 },
  amount: { type: 'message', field: 3, repeated: true, message: Coin },
});

export const MsgSendResponse = defineMessage('/cosmos.bank.v1beta1.MsgSendResponse', {});

export const MsgMultiSend = defineMessage('/cosmos.bank.v1beta1.MsgMultiSend', {
  inputs: { type: 'message', field: 1, repeated: true, message: Input },
  outputs: { type: 'message', field: 2, repeated: true, message: Output },
});

export const MsgMultiSendResponse = defineMessage('/cosmos.bank.v1beta1.MsgMultiSendResponse', {});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const QueryBalanceRequest = defineMessage('/cosmos.bank.v1beta1.QueryBalanceRequest', {
  address: { type: 'string', field: 1 },
  denom: { type: 'string', field: 2 },
});

export const QueryBalanceResponse = defineMessage('/cosmos.bank.v1beta1.QueryBalanceResponse', {
  balance: { type: 'message', field: 1, message: Coin },
});

export const QueryAllBalancesRequest = defineMessage('/cosmos.bank.v1beta1.QueryAllBalancesRequest', {
  address: { type: 'string', field: 1 },
});

export const QueryAllBalancesResponse = defineMessage('/cosmos.bank.v1beta1.QueryAllBalancesResponse', {
  balances: { type: 'message', field: 1, repeated: true, message: Coin },
});

// ---------------------------------------------------------------------------
// Module client
// ---------------------------------------------------------------------------

export const bank = defineProto({
  MsgSend,
  MsgSendResponse,
  MsgMultiSend,
  MsgMultiSendResponse,
  QueryBalanceRequest,
  QueryBalanceResponse,
  QueryAllBalancesRequest,
  QueryAllBalancesResponse,
}, 'cosmos.bank.v1beta1');
