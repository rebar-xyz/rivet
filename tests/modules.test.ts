import { describe, it, expect } from 'vitest';
import { bank, MsgSend as BankMsgSend } from '../src/modules/bank.js';
import { staking } from '../src/modules/staking.js';
import { gov } from '../src/modules/gov.js';
import { distribution } from '../src/modules/distribution.js';
import { Coin as CommonCoin } from '../src/modules/common.js';
import { MsgSend as CosmjsMsgSend } from 'cosmjs-types/cosmos/bank/v1beta1/tx';
import { MsgDelegate as CosmjsMsgDelegate, MsgUndelegate as CosmjsMsgUndelegate, MsgBeginRedelegate as CosmjsMsgBeginRedelegate } from 'cosmjs-types/cosmos/staking/v1beta1/tx';
import { MsgVote as CosmjsMsgVote, MsgDeposit as CosmjsMsgDeposit } from 'cosmjs-types/cosmos/gov/v1/tx';
import { MsgWithdrawDelegatorReward as CosmjsMsgWithdrawDelegatorReward, MsgWithdrawValidatorCommission as CosmjsMsgWithdrawValidatorCommission } from 'cosmjs-types/cosmos/distribution/v1beta1/tx';

// ---------------------------------------------------------------------------
// Type URLs
// ---------------------------------------------------------------------------

describe('module type URLs', () => {
  it('bank module has correct type URLs', () => {
    expect(bank.Send.typeUrl).toBe('/cosmos.bank.v1beta1.MsgSend');
    expect(bank.MultiSend.typeUrl).toBe('/cosmos.bank.v1beta1.MsgMultiSend');
  });

  it('staking module has correct type URLs', () => {
    expect(staking.Delegate.typeUrl).toBe('/cosmos.staking.v1beta1.MsgDelegate');
    expect(staking.Undelegate.typeUrl).toBe('/cosmos.staking.v1beta1.MsgUndelegate');
    expect(staking.BeginRedelegate.typeUrl).toBe('/cosmos.staking.v1beta1.MsgBeginRedelegate');
  });

  it('gov module has correct type URLs', () => {
    expect(gov.SubmitProposal.typeUrl).toBe('/cosmos.gov.v1.MsgSubmitProposal');
    expect(gov.Vote.typeUrl).toBe('/cosmos.gov.v1.MsgVote');
    expect(gov.Deposit.typeUrl).toBe('/cosmos.gov.v1.MsgDeposit');
  });

  it('distribution module has correct type URLs', () => {
    expect(distribution.WithdrawDelegatorReward.typeUrl).toBe('/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward');
    expect(distribution.WithdrawValidatorCommission.typeUrl).toBe('/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission');
  });
});

// ---------------------------------------------------------------------------
// Query paths
// ---------------------------------------------------------------------------

describe('module query paths', () => {
  it('bank query paths', () => {
    expect(bank.Balance.path).toBe('/cosmos.bank.v1beta1.Query/Balance');
    expect(bank.AllBalances.path).toBe('/cosmos.bank.v1beta1.Query/AllBalances');
  });

  it('staking query paths', () => {
    expect(staking.Delegation.path).toBe('/cosmos.staking.v1beta1.Query/Delegation');
    expect(staking.Validator.path).toBe('/cosmos.staking.v1beta1.Query/Validator');
  });

  it('gov query paths', () => {
    expect(gov.Proposal.path).toBe('/cosmos.gov.v1.Query/Proposal');
  });

  it('distribution query paths', () => {
    expect(distribution.DelegationRewards.path).toBe('/cosmos.distribution.v1beta1.Query/DelegationRewards');
  });
});

// ---------------------------------------------------------------------------
// Cross-module Coin compatibility
// ---------------------------------------------------------------------------

describe('cross-module compatibility', () => {
  it('bank module Coin matches common Coin encoding', () => {
    const fromBank = BankMsgSend.encode(BankMsgSend.fromPartial({
      fromAddress: 'cosmos1abc',
      toAddress: 'cosmos1def',
      amount: [{ denom: 'uatom', amount: '100' }],
    })).finish();

    const decoded = BankMsgSend.decode(fromBank);
    expect(decoded.amount[0]!.denom).toBe('uatom');

    const coinBytes = CommonCoin.encode(CommonCoin.fromPartial({ denom: 'uatom', amount: '100' })).finish();
    const coinDecoded = CommonCoin.decode(coinBytes);
    expect(coinDecoded).toEqual({ denom: 'uatom', amount: '100' });
  });
});

// ---------------------------------------------------------------------------
// Byte-for-byte compatibility with cosmjs-types
// ---------------------------------------------------------------------------

const ADDR = 'cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu';
const VAL_ADDR = 'cosmosvaloper1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu';
const COIN = { denom: 'uatom', amount: '1000000' };

interface Codec {
  encode: (v: any) => { finish(): Uint8Array };
  fromPartial: (v: any) => any;
}

interface ByteCase {
  name: string;
  rivet: Codec;
  cosmjs: Codec;
  input: Record<string, unknown>;
}

const cases: ByteCase[] = [
  {
    name: 'MsgSend',
    rivet: bank.Send,
    cosmjs: CosmjsMsgSend,
    input: { fromAddress: ADDR, toAddress: ADDR, amount: [COIN] },
  },
  {
    name: 'MsgDelegate',
    rivet: staking.Delegate,
    cosmjs: CosmjsMsgDelegate,
    input: { delegatorAddress: ADDR, validatorAddress: VAL_ADDR, amount: COIN },
  },
  {
    name: 'MsgUndelegate',
    rivet: staking.Undelegate,
    cosmjs: CosmjsMsgUndelegate,
    input: { delegatorAddress: ADDR, validatorAddress: VAL_ADDR, amount: COIN },
  },
  {
    name: 'MsgBeginRedelegate',
    rivet: staking.BeginRedelegate,
    cosmjs: CosmjsMsgBeginRedelegate,
    input: { delegatorAddress: ADDR, validatorSrcAddress: VAL_ADDR, validatorDstAddress: VAL_ADDR, amount: COIN },
  },
  {
    name: 'MsgVote',
    rivet: gov.Vote,
    cosmjs: CosmjsMsgVote,
    input: { proposalId: 1n, voter: ADDR, option: 1, metadata: '' },
  },
  {
    name: 'MsgDeposit',
    rivet: gov.Deposit,
    cosmjs: CosmjsMsgDeposit,
    input: { proposalId: 1n, depositor: ADDR, amount: [COIN] },
  },
  {
    name: 'MsgWithdrawDelegatorReward',
    rivet: distribution.WithdrawDelegatorReward,
    cosmjs: CosmjsMsgWithdrawDelegatorReward,
    input: { delegatorAddress: ADDR, validatorAddress: VAL_ADDR },
  },
  {
    name: 'MsgWithdrawValidatorCommission',
    rivet: distribution.WithdrawValidatorCommission,
    cosmjs: CosmjsMsgWithdrawValidatorCommission,
    input: { validatorAddress: VAL_ADDR },
  },
];

describe('byte-for-byte compatibility', () => {
  for (const c of cases) {
    it(`${c.name} encoding matches cosmjs-types`, () => {
      const cosmjsBytes = c.cosmjs.encode(c.cosmjs.fromPartial(c.input)).finish();
      const rivetBytes = c.rivet.encode(c.rivet.fromPartial(c.input)).finish();
      expect(rivetBytes).toEqual(cosmjsBytes);
    });
  }
});
