import { defineMessage } from '../define-message.js';
import { defineProto } from '../proto-helpers.js';
import { Coin } from './common.js';

// ---------------------------------------------------------------------------
// Shared types (must be defined before messages that reference them)
// ---------------------------------------------------------------------------

/** google.protobuf.Timestamp (seconds + nanos) */
const Timestamp = defineMessage('/google.protobuf.Timestamp', {
  seconds: { type: 'int64', field: 1 },
  nanos: { type: 'int32', field: 2 },
});

const Description = defineMessage('/cosmos.staking.v1beta1.Description', {
  moniker: { type: 'string', field: 1 },
  identity: { type: 'string', field: 2 },
  website: { type: 'string', field: 3 },
  securityContact: { type: 'string', field: 4 },
  details: { type: 'string', field: 5 },
});

const CommissionRates = defineMessage('/cosmos.staking.v1beta1.CommissionRates', {
  rate: { type: 'string', field: 1 },
  maxRate: { type: 'string', field: 2 },
  maxChangeRate: { type: 'string', field: 3 },
});

const Commission = defineMessage('/cosmos.staking.v1beta1.Commission', {
  commissionRates: { type: 'message', field: 1, message: CommissionRates },
  updateTime: { type: 'message', field: 2, message: Timestamp },
});

const Validator = defineMessage('/cosmos.staking.v1beta1.Validator', {
  operatorAddress: { type: 'string', field: 1 },
  jailed: { type: 'bool', field: 4 },
  status: { type: 'enum', field: 5 },
  tokens: { type: 'string', field: 6 },
  delegatorShares: { type: 'string', field: 7 },
  description: { type: 'message', field: 8, message: Description },
  unbondingHeight: { type: 'int64', field: 9 },
  unbondingTime: { type: 'message', field: 10, message: Timestamp },
  commission: { type: 'message', field: 11, message: Commission },
  minSelfDelegation: { type: 'string', field: 12 },
});

const Delegation = defineMessage('/cosmos.staking.v1beta1.Delegation', {
  delegatorAddress: { type: 'string', field: 1 },
  validatorAddress: { type: 'string', field: 2 },
  shares: { type: 'string', field: 3 },
});

const DelegationResponse = defineMessage('/cosmos.staking.v1beta1.DelegationResponse', {
  delegation: { type: 'message', field: 1, message: Delegation },
  balance: { type: 'message', field: 2, message: Coin },
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const MsgDelegate = defineMessage('/cosmos.staking.v1beta1.MsgDelegate', {
  delegatorAddress: { type: 'string', field: 1 },
  validatorAddress: { type: 'string', field: 2 },
  amount: { type: 'message', field: 3, message: Coin },
});

export const MsgDelegateResponse = defineMessage('/cosmos.staking.v1beta1.MsgDelegateResponse', {});

export const MsgUndelegate = defineMessage('/cosmos.staking.v1beta1.MsgUndelegate', {
  delegatorAddress: { type: 'string', field: 1 },
  validatorAddress: { type: 'string', field: 2 },
  amount: { type: 'message', field: 3, message: Coin },
});

export const MsgUndelegateResponse = defineMessage('/cosmos.staking.v1beta1.MsgUndelegateResponse', {
  completionTime: { type: 'message', field: 1, message: Timestamp },
});

export const MsgBeginRedelegate = defineMessage('/cosmos.staking.v1beta1.MsgBeginRedelegate', {
  delegatorAddress: { type: 'string', field: 1 },
  validatorSrcAddress: { type: 'string', field: 2 },
  validatorDstAddress: { type: 'string', field: 3 },
  amount: { type: 'message', field: 4, message: Coin },
});

export const MsgBeginRedelegateResponse = defineMessage('/cosmos.staking.v1beta1.MsgBeginRedelegateResponse', {
  completionTime: { type: 'message', field: 1, message: Timestamp },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const QueryDelegationRequest = defineMessage('/cosmos.staking.v1beta1.QueryDelegationRequest', {
  delegatorAddr: { type: 'string', field: 1 },
  validatorAddr: { type: 'string', field: 2 },
});

export const QueryDelegationResponse = defineMessage('/cosmos.staking.v1beta1.QueryDelegationResponse', {
  delegationResponse: { type: 'message', field: 1, message: DelegationResponse },
});

export const QueryValidatorRequest = defineMessage('/cosmos.staking.v1beta1.QueryValidatorRequest', {
  validatorAddr: { type: 'string', field: 1 },
});

export const QueryValidatorResponse = defineMessage('/cosmos.staking.v1beta1.QueryValidatorResponse', {
  validator: { type: 'message', field: 1, message: Validator },
});

// ---------------------------------------------------------------------------
// Module client
// ---------------------------------------------------------------------------

export const staking = defineProto({
  MsgDelegate,
  MsgDelegateResponse,
  MsgUndelegate,
  MsgUndelegateResponse,
  MsgBeginRedelegate,
  MsgBeginRedelegateResponse,
  QueryDelegationRequest,
  QueryDelegationResponse,
  QueryValidatorRequest,
  QueryValidatorResponse,
}, 'cosmos.staking.v1beta1');
