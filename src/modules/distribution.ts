import { defineMessage } from '../define-message.js';
import { defineProto } from '../proto-helpers.js';
import { Coin } from './common.js';

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const MsgWithdrawDelegatorReward = defineMessage('/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward', {
  delegatorAddress: { type: 'string', field: 1 },
  validatorAddress: { type: 'string', field: 2 },
});

export const MsgWithdrawDelegatorRewardResponse = defineMessage('/cosmos.distribution.v1beta1.MsgWithdrawDelegatorRewardResponse', {
  amount: { type: 'message', field: 1, repeated: true, message: Coin },
});

export const MsgWithdrawValidatorCommission = defineMessage('/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission', {
  validatorAddress: { type: 'string', field: 1 },
});

export const MsgWithdrawValidatorCommissionResponse = defineMessage('/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommissionResponse', {
  amount: { type: 'message', field: 1, repeated: true, message: Coin },
});

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** DecCoin uses string for amount to represent decimals */
const DecCoin = defineMessage('/cosmos.base.v1beta1.DecCoin', {
  denom: { type: 'string', field: 1 },
  amount: { type: 'string', field: 2 },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const QueryDelegationRewardsRequest = defineMessage('/cosmos.distribution.v1beta1.QueryDelegationRewardsRequest', {
  delegatorAddress: { type: 'string', field: 1 },
  validatorAddress: { type: 'string', field: 2 },
});

export const QueryDelegationRewardsResponse = defineMessage('/cosmos.distribution.v1beta1.QueryDelegationRewardsResponse', {
  rewards: { type: 'message', field: 1, repeated: true, message: DecCoin },
});

// ---------------------------------------------------------------------------
// Module client
// ---------------------------------------------------------------------------

export const distribution = defineProto({
  MsgWithdrawDelegatorReward,
  MsgWithdrawDelegatorRewardResponse,
  MsgWithdrawValidatorCommission,
  MsgWithdrawValidatorCommissionResponse,
  QueryDelegationRewardsRequest,
  QueryDelegationRewardsResponse,
}, 'cosmos.distribution.v1beta1');
