import { defineMessage } from '../define-message.js';
import { defineProto } from '../proto-helpers.js';
import { Coin } from './common.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

const Timestamp = defineMessage('/google.protobuf.Timestamp', {
  seconds: { type: 'int64', field: 1 },
  nanos: { type: 'int32', field: 2 },
});

const Any = defineMessage('/google.protobuf.Any', {
  typeUrl: { type: 'string', field: 1 },
  value: { type: 'bytes', field: 2 },
});

const TallyResult = defineMessage('/cosmos.gov.v1.TallyResult', {
  yesCount: { type: 'string', field: 1 },
  abstainCount: { type: 'string', field: 2 },
  noCount: { type: 'string', field: 3 },
  noWithVetoCount: { type: 'string', field: 4 },
});

const Proposal = defineMessage('/cosmos.gov.v1.Proposal', {
  id: { type: 'uint64', field: 1 },
  messages: { type: 'message', field: 2, repeated: true, message: Any },
  status: { type: 'enum', field: 3 },
  finalTallyResult: { type: 'message', field: 4, message: TallyResult },
  submitTime: { type: 'message', field: 5, message: Timestamp },
  depositEndTime: { type: 'message', field: 6, message: Timestamp },
  totalDeposit: { type: 'message', field: 7, repeated: true, message: Coin },
  votingStartTime: { type: 'message', field: 8, message: Timestamp },
  votingEndTime: { type: 'message', field: 9, message: Timestamp },
  metadata: { type: 'string', field: 10 },
  title: { type: 'string', field: 11 },
  summary: { type: 'string', field: 12 },
  proposer: { type: 'string', field: 13 },
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const MsgSubmitProposal = defineMessage('/cosmos.gov.v1.MsgSubmitProposal', {
  messages: { type: 'message', field: 1, repeated: true, message: Any },
  initialDeposit: { type: 'message', field: 2, repeated: true, message: Coin },
  proposer: { type: 'string', field: 3 },
  metadata: { type: 'string', field: 4 },
  title: { type: 'string', field: 5 },
  summary: { type: 'string', field: 6 },
});

export const MsgSubmitProposalResponse = defineMessage('/cosmos.gov.v1.MsgSubmitProposalResponse', {
  proposalId: { type: 'uint64', field: 1 },
});

/** VoteOption enum values: 0=UNSPECIFIED, 1=YES, 2=ABSTAIN, 3=NO, 4=NO_WITH_VETO */
export const MsgVote = defineMessage('/cosmos.gov.v1.MsgVote', {
  proposalId: { type: 'uint64', field: 1 },
  voter: { type: 'string', field: 2 },
  option: { type: 'enum', field: 3 },
  metadata: { type: 'string', field: 4 },
});

export const MsgVoteResponse = defineMessage('/cosmos.gov.v1.MsgVoteResponse', {});

export const MsgDeposit = defineMessage('/cosmos.gov.v1.MsgDeposit', {
  proposalId: { type: 'uint64', field: 1 },
  depositor: { type: 'string', field: 2 },
  amount: { type: 'message', field: 3, repeated: true, message: Coin },
});

export const MsgDepositResponse = defineMessage('/cosmos.gov.v1.MsgDepositResponse', {});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const QueryProposalRequest = defineMessage('/cosmos.gov.v1.QueryProposalRequest', {
  proposalId: { type: 'uint64', field: 1 },
});

export const QueryProposalResponse = defineMessage('/cosmos.gov.v1.QueryProposalResponse', {
  proposal: { type: 'message', field: 1, message: Proposal },
});

// ---------------------------------------------------------------------------
// Module client
// ---------------------------------------------------------------------------

export const gov = defineProto({
  MsgSubmitProposal,
  MsgSubmitProposalResponse,
  MsgVote,
  MsgVoteResponse,
  MsgDeposit,
  MsgDepositResponse,
  QueryProposalRequest,
  QueryProposalResponse,
}, 'cosmos.gov.v1');
