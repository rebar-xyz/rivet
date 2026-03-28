/**
 * Codegen compatibility tests.
 *
 * Verifies that defineProto works end-to-end with real Telescope-generated
 * codecs from cosmjs-types — not hand-crafted mocks. Covers message
 * classification, typeUrl derivation, encode/decode roundtrips, query
 * helpers, and fromPartial default filling across multiple Cosmos SDK
 * modules (bank, staking, IBC transfer).
 */

import { describe, it, expect } from 'vitest';
import { defineProto, type MinimalCodec } from '../src/proto-helpers';
import { TxMsgData } from '../src/proto/abci';

// Real Telescope-generated codecs from cosmjs-types
import {
  MsgSend,
  MsgSendResponse,
  MsgMultiSend,
  MsgMultiSendResponse,
} from 'cosmjs-types/cosmos/bank/v1beta1/tx';
import {
  QueryBalanceRequest,
  QueryBalanceResponse,
} from 'cosmjs-types/cosmos/bank/v1beta1/query';
import {
  MsgDelegate,
  MsgDelegateResponse,
} from 'cosmjs-types/cosmos/staking/v1beta1/tx';
import {
  MsgTransfer,
  MsgTransferResponse,
} from 'cosmjs-types/ibc/applications/transfer/v1/tx';

// ─── Codec Shape Validation ─────────────────────────────────────────────────

describe('Telescope codec shape', () => {
  const codecs: [string, unknown][] = [
    ['MsgSend', MsgSend],
    ['MsgSendResponse', MsgSendResponse],
    ['MsgDelegate', MsgDelegate],
    ['MsgDelegateResponse', MsgDelegateResponse],
    ['MsgTransfer', MsgTransfer],
    ['MsgTransferResponse', MsgTransferResponse],
    ['QueryBalanceRequest', QueryBalanceRequest],
    ['QueryBalanceResponse', QueryBalanceResponse],
  ];

  it.each(codecs)('%s satisfies MinimalCodec', (_name, codec) => {
    const c = codec as Record<string, unknown>;
    expect(typeof c.encode).toBe('function');
    expect(typeof c.decode).toBe('function');
    expect(typeof c.fromPartial).toBe('function');
  });

  it.each(codecs)('%s.encode().finish() returns Uint8Array', (_name, codec) => {
    const c = codec as MinimalCodec;
    const result = c.encode(c.fromPartial({}));
    expect(typeof result.finish).toBe('function');
    const bytes = result.finish();
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it('Telescope codecs include typeUrl (unlike ts-proto)', () => {
    // Telescope-generated codecs carry typeUrl as a property.
    // ts-proto does NOT. Both must work with defineProto.
    expect((MsgSend as any).typeUrl).toBe('/cosmos.bank.v1beta1.MsgSend');
    expect((MsgDelegate as any).typeUrl).toBe('/cosmos.staking.v1beta1.MsgDelegate');
    expect((MsgTransfer as any).typeUrl).toBe('/ibc.applications.transfer.v1.MsgTransfer');
  });
});

// ─── Bank Module: MsgSend ───────────────────────────────────────────────────

describe('defineProto with cosmjs-types bank module', () => {
  const bank = defineProto({
    MsgSend,
    MsgSendResponse,
    MsgMultiSend,
    MsgMultiSendResponse,
    QueryBalanceRequest,
    QueryBalanceResponse,
  }, 'cosmos.bank.v1beta1');

  it('classifies MsgSend and derives correct typeUrl', () => {
    expect(bank.Send).toBeDefined();
    expect(bank.Send.typeUrl).toBe('/cosmos.bank.v1beta1.MsgSend');
  });

  it('classifies MsgMultiSend', () => {
    expect(bank.MultiSend).toBeDefined();
    expect(bank.MultiSend.typeUrl).toBe('/cosmos.bank.v1beta1.MsgMultiSend');
  });

  it('pairs Send with SendResponse for decodeResponse', () => {
    expect(typeof bank.Send.decodeResponse).toBe('function');
    expect(typeof bank.Send.decodeBatchResponse).toBe('function');
  });

  it('encodes MsgSend and roundtrips through decode', () => {
    const msg = bank.Send({
      fromAddress: 'cosmos1sender000000000000000000000000000',
      toAddress: 'cosmos1receiver0000000000000000000000000',
      amount: [{ denom: 'uatom', amount: '1000000' }],
    });

    expect(msg.typeUrl).toBe('/cosmos.bank.v1beta1.MsgSend');
    expect(msg.value).toBeInstanceOf(Uint8Array);
    expect(msg.value.length).toBeGreaterThan(0);

    const decoded = bank.Send.decode(msg.value);
    expect(decoded.fromAddress).toBe('cosmos1sender000000000000000000000000000');
    expect(decoded.toAddress).toBe('cosmos1receiver0000000000000000000000000');
    expect(decoded.amount).toHaveLength(1);
    expect(decoded.amount[0]!.denom).toBe('uatom');
    expect(decoded.amount[0]!.amount).toBe('1000000');
  });

  it('encodes MsgSend with multiple coins', () => {
    const msg = bank.Send({
      fromAddress: 'cosmos1from',
      toAddress: 'cosmos1to',
      amount: [
        { denom: 'uatom', amount: '500' },
        { denom: 'uosmo', amount: '1000' },
        { denom: 'ustars', amount: '2000' },
      ],
    });

    const decoded = bank.Send.decode(msg.value);
    expect(decoded.amount).toHaveLength(3);
    expect(decoded.amount[2]!.denom).toBe('ustars');
  });

  it('fromPartial fills defaults for MsgSend', () => {
    const partial = bank.Send.fromPartial({});
    expect(partial.fromAddress).toBe('');
    expect(partial.toAddress).toBe('');
    expect(partial.amount).toEqual([]);
  });

  it('classifies QueryBalanceRequest/Response as query helper', () => {
    expect(bank.Balance).toBeDefined();
    expect(bank.Balance.path).toBe('/cosmos.bank.v1beta1.Query/Balance');
  });

  it('query helper encodes request and decodes response', async () => {
    let capturedPath = '';
    let capturedBytes: Uint8Array | undefined;

    const mockClient = {
      query: async (path: string, data: Uint8Array) => {
        capturedPath = path;
        capturedBytes = data;
        return QueryBalanceResponse.encode(
          QueryBalanceResponse.fromPartial({
            balance: { denom: 'uatom', amount: '999' },
          }),
        ).finish();
      },
    };

    const result = await bank.Balance(mockClient, { address: 'cosmos1abc', denom: 'uatom' });
    expect(capturedPath).toBe('/cosmos.bank.v1beta1.Query/Balance');
    expect(result.balance?.denom).toBe('uatom');
    expect(result.balance?.amount).toBe('999');

    // Verify the request was properly encoded
    const decodedReq = QueryBalanceRequest.decode(capturedBytes!);
    expect(decodedReq.address).toBe('cosmos1abc');
    expect(decodedReq.denom).toBe('uatom');
  });
});

// ─── Staking Module: MsgDelegate ────────────────────────────────────────────

describe('defineProto with cosmjs-types staking module', () => {
  const staking = defineProto({
    MsgDelegate,
    MsgDelegateResponse,
  }, 'cosmos.staking.v1beta1');

  it('classifies MsgDelegate with correct typeUrl', () => {
    expect(staking.Delegate).toBeDefined();
    expect(staking.Delegate.typeUrl).toBe('/cosmos.staking.v1beta1.MsgDelegate');
  });

  it('encodes MsgDelegate with nested Coin and roundtrips', () => {
    const msg = staking.Delegate({
      delegatorAddress: 'cosmos1delegator',
      validatorAddress: 'cosmosvaloper1validator',
      amount: { denom: 'uatom', amount: '5000000' },
    });

    const decoded = staking.Delegate.decode(msg.value);
    expect(decoded.delegatorAddress).toBe('cosmos1delegator');
    expect(decoded.validatorAddress).toBe('cosmosvaloper1validator');
    expect(decoded.amount.denom).toBe('uatom');
    expect(decoded.amount.amount).toBe('5000000');
  });

  it('fromPartial fills defaults for nested Coin', () => {
    const partial = staking.Delegate.fromPartial({
      delegatorAddress: 'cosmos1del',
    });
    expect(partial.delegatorAddress).toBe('cosmos1del');
    expect(partial.validatorAddress).toBe('');
  });
});

// ─── IBC Transfer: MsgTransfer ──────────────────────────────────────────────

describe('defineProto with cosmjs-types IBC transfer', () => {
  const ibc = defineProto({
    MsgTransfer,
    MsgTransferResponse,
  }, 'ibc.applications.transfer.v1');

  it('classifies MsgTransfer with correct typeUrl', () => {
    expect(ibc.Transfer).toBeDefined();
    expect(ibc.Transfer.typeUrl).toBe('/ibc.applications.transfer.v1.MsgTransfer');
  });

  it('encodes MsgTransfer with all fields and roundtrips', () => {
    const msg = ibc.Transfer({
      sourcePort: 'transfer',
      sourceChannel: 'channel-0',
      token: { denom: 'uatom', amount: '1000000' },
      sender: 'cosmos1sender',
      receiver: 'osmo1receiver',
      timeoutHeight: { revisionNumber: 1n, revisionHeight: 100n },
      timeoutTimestamp: 1700000000000000000n,
      memo: '{"wasm":{"contract":"osmo1..."}}',
    });

    const decoded = ibc.Transfer.decode(msg.value);
    expect(decoded.sourcePort).toBe('transfer');
    expect(decoded.sourceChannel).toBe('channel-0');
    expect(decoded.token.denom).toBe('uatom');
    expect(decoded.token.amount).toBe('1000000');
    expect(decoded.sender).toBe('cosmos1sender');
    expect(decoded.receiver).toBe('osmo1receiver');
    expect(decoded.memo).toBe('{"wasm":{"contract":"osmo1..."}}');
    expect(decoded.timeoutTimestamp).toBe(1700000000000000000n);
  });

  it('encodes MsgTransfer with PFM-style memo', () => {
    const pfmMemo = JSON.stringify({
      forward: {
        receiver: 'juno1final',
        port: 'transfer',
        channel: 'channel-42',
      },
    });

    const msg = ibc.Transfer({
      sourcePort: 'transfer',
      sourceChannel: 'channel-1',
      token: { denom: 'uosmo', amount: '500000' },
      sender: 'osmo1sender',
      receiver: 'cosmos1intermediate',
      timeoutTimestamp: 0n,
      memo: pfmMemo,
    });

    const decoded = ibc.Transfer.decode(msg.value);
    expect(decoded.memo).toBe(pfmMemo);
    const parsedMemo = JSON.parse(decoded.memo);
    expect(parsedMemo.forward.channel).toBe('channel-42');
  });

  it('fromPartial fills defaults including bigint fields', () => {
    const partial = ibc.Transfer.fromPartial({
      sourcePort: 'transfer',
    });
    expect(partial.sourcePort).toBe('transfer');
    expect(partial.sourceChannel).toBe('');
    expect(partial.sender).toBe('');
    expect(partial.receiver).toBe('');
    expect(partial.timeoutTimestamp).toBe(0n);
    expect(partial.memo).toBe('');
  });
});

// ─── typeUrl Priority ───────────────────────────────────────────────────────

describe('defineProto — typeUrl priority', () => {
  it('uses codec typeUrl when present (Telescope codecs)', () => {
    // Telescope codecs have typeUrl. Even if prefix differs, codec wins.
    const helpers = defineProto({
      MsgSend,
      MsgSendResponse,
    }, 'cosmos.bank.v1beta1');

    // MsgSend.typeUrl is '/cosmos.bank.v1beta1.MsgSend'
    expect(helpers.Send.typeUrl).toBe((MsgSend as any).typeUrl);
  });

  it('derives typeUrl from prefix when codec has no typeUrl', () => {
    // Simulate ts-proto codec (no typeUrl property)
    const tsProtoLike = {
      encode(msg: any) { return { finish: () => new Uint8Array(0) }; },
      decode(input: Uint8Array) { return {}; },
      fromPartial(partial: any) { return { ...partial }; },
      // No typeUrl!
    };

    const helpers = defineProto({
      MsgCustomAction: tsProtoLike,
    }, 'mychain.mymodule.v1');

    expect(helpers.CustomAction.typeUrl).toBe('/mychain.mymodule.v1.MsgCustomAction');
  });
});

// ─── Response Decoding with Real Codecs ─────────────────────────────────────

describe('defineProto — response decoding with real codecs', () => {
  it('decodes MsgTransferResponse from broadcast result', () => {
    const ibc = defineProto({
      MsgTransfer,
      MsgTransferResponse,
    }, 'ibc.applications.transfer.v1');

    const responseBytes = MsgTransferResponse.encode(
      MsgTransferResponse.fromPartial({ sequence: 42n }),
    ).finish();

    const txMsgDataBytes = TxMsgData.encode({
      msgResponses: [{
        typeUrl: '/ibc.applications.transfer.v1.MsgTransferResponse',
        value: responseBytes,
      }],
    });

    const result = {
      broadcastResponse: {
        tx: new Uint8Array(0),
        txResult: {
          code: 0, log: '', data: txMsgDataBytes,
          gasUsed: 0n, gasWanted: 0n, events: [],
        },
        height: 100,
        hash: new Uint8Array(32),
      },
    };

    const decoded = ibc.Transfer.decodeResponse(result);
    expect(decoded.sequence).toBe(42n);
  });

  it('decodes empty MsgSendResponse from broadcast result', () => {
    const bank = defineProto({
      MsgSend,
      MsgSendResponse,
    }, 'cosmos.bank.v1beta1');

    const responseBytes = MsgSendResponse.encode(
      MsgSendResponse.fromPartial({}),
    ).finish();

    const txMsgDataBytes = TxMsgData.encode({
      msgResponses: [{
        typeUrl: '/cosmos.bank.v1beta1.MsgSendResponse',
        value: responseBytes,
      }],
    });

    const result = {
      broadcastResponse: {
        tx: new Uint8Array(0),
        txResult: {
          code: 0, log: '', data: txMsgDataBytes,
          gasUsed: 0n, gasWanted: 0n, events: [],
        },
        height: 1,
        hash: new Uint8Array(32),
      },
    };

    // MsgSendResponse is empty — should decode without error
    const decoded = bank.Send.decodeResponse(result);
    expect(decoded).toBeDefined();
  });
});

// ─── Mixed Module Registration ──────────────────────────────────────────────

describe('defineProto — multi-module in single call', () => {
  it('handles mixed message and query codecs from one module', () => {
    const bank = defineProto({
      MsgSend,
      MsgSendResponse,
      MsgMultiSend,
      MsgMultiSendResponse,
      QueryBalanceRequest,
      QueryBalanceResponse,
    }, 'cosmos.bank.v1beta1');

    // Messages
    expect(bank.Send.typeUrl).toBe('/cosmos.bank.v1beta1.MsgSend');
    expect(bank.MultiSend.typeUrl).toBe('/cosmos.bank.v1beta1.MsgMultiSend');
    expect(typeof bank.Send.decodeResponse).toBe('function');
    expect(typeof bank.MultiSend.decodeResponse).toBe('function');

    // Queries
    expect(bank.Balance.path).toBe('/cosmos.bank.v1beta1.Query/Balance');

    // Encode both message types and verify independence
    const send = bank.Send({ fromAddress: 'a', toAddress: 'b', amount: [] });
    const multi = bank.MultiSend({ inputs: [], outputs: [] });
    expect(send.typeUrl).not.toBe(multi.typeUrl);
  });
});
