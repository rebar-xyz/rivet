# Rivet

A Cosmos SDK client that does signing, broadcasting, querying, and real-time subscriptions in one package. 3 runtime dependencies. ~12 KB gzipped. No protobuf runtime.

```
pnpm add @rebarxyz/rivet
```

## Quick Start

```typescript
import { Rivet } from '@rebarxyz/rivet';
import { bank } from '@rebarxyz/rivet/modules/bank';

const rivet = Rivet.connect('https://rpc.cosmos.network', {
  wallet: offlineSigner,
  gasConfig: { gasPrice: '0.025uatom' },
});

const result = await rivet.signAndBroadcast({
  messages: [bank.Send({
    fromAddress: sender,
    toAddress: recipient,
    amount: [{ denom: 'uatom', amount: '1000000' }],
  })],
});

const balance = await bank.Balance(rivet, { address: sender, denom: 'uatom' });
```

One package, one client. Messages are typed and callable, gas is estimated automatically, and queries work through the same instance.

## Why Rivet?

### You install one package

Message encoding, signing, gas estimation, broadcasting, ABCI and gRPC queries, WebSocket subscriptions, and HD wallet derivation — all from a single `@rebarxyz/rivet` import. No coordinating between multiple packages for different parts of the transaction lifecycle.

### You skip the protobuf runtime

The [~15 Cosmos SDK types](#hand-coded-proto-types) needed for the transaction envelope are hand-coded. No protobuf runtime (`protobufjs`, `@bufbuild/protobuf`, etc.) in your dependency tree. Your chain's message types come from your existing codegen (ts-proto or cosmjs-types), or from Rivet's built-in modules if you're working with standard Cosmos messages.

### You can skip codegen entirely

Rivet's built-in modules cover the most common Cosmos SDK operations — bank, staking, governance, distribution — with zero codegen. For custom chain messages, [`defineMessage`](#definemessage---skip-codegen) lets you define protobuf codecs inline with full type inference. No `.proto` files, no code generation step, no generated code to commit.

### Your bundle stays small

`sideEffects: false` throughout. Explicit exports, no barrel re-exports. The HD wallet is a separate entry point so browser apps don't pull in BIP-32 key derivation. Total bundle size including all dependencies is ~12 KB gzipped (40 KB raw). CosmJS with equivalent functionality bundles to ~300 KB gzipped — about 25x larger.

### Your tests don't need a running chain

Rivet ships a [mock client](#testing-with-mocks) that implements the full signing interface. Record broadcasts, simulate queries, emit WebSocket events — all in-memory, all synchronous. No Docker containers, no test fixtures, no waiting for blocks.

## Built-in Modules

Common Cosmos SDK operations work out of the box with no codegen:

```typescript
import { bank } from '@rebarxyz/rivet/modules/bank';
import { staking } from '@rebarxyz/rivet/modules/staking';
import { gov } from '@rebarxyz/rivet/modules/gov';
import { distribution } from '@rebarxyz/rivet/modules/distribution';
```

Each module provides typed message helpers and query helpers:

```typescript
// Send tokens
await rivet.signAndBroadcast({
  messages: [bank.Send({ fromAddress, toAddress, amount })],
});

// Delegate to a validator
await rivet.signAndBroadcast({
  messages: [staking.Delegate({
    delegatorAddress: myAddr,
    validatorAddress: valAddr,
    amount: { denom: 'uatom', amount: '1000000' },
  })],
});

// Query balances
const bal = await bank.Balance(rivet, { address: myAddr, denom: 'uatom' });

// Withdraw staking rewards
await rivet.signAndBroadcast({
  messages: [distribution.WithdrawDelegatorReward({
    delegatorAddress: myAddr,
    validatorAddress: valAddr,
  })],
});
```

| Module | Messages | Queries |
|---|---|---|
| bank | Send, MultiSend | Balance, AllBalances |
| staking | Delegate, Undelegate, BeginRedelegate | Delegation, Validator |
| gov | SubmitProposal, Vote, Deposit | Proposal |
| distribution | WithdrawDelegatorReward, WithdrawValidatorCommission | DelegationRewards |

Modules are tree-shakeable — import only what you use. Each is a separate entry point (`@rebarxyz/rivet/modules/bank`, etc.) so unused modules don't touch your bundle.

## defineMessage — Skip Codegen

For custom chain messages, define protobuf codecs inline instead of running a code generation pipeline:

```typescript
import { defineMessage, defineProto } from '@rebarxyz/rivet';

const MsgCreatePost = defineMessage('/mychain.blog.v1.MsgCreatePost', {
  author: { type: 'string', field: 1 },
  title: { type: 'string', field: 2 },
  body: { type: 'string', field: 3 },
  tags: { type: 'string', field: 4, repeated: true },
});

const MsgCreatePostResponse = defineMessage('/mychain.blog.v1.MsgCreatePostResponse', {
  id: { type: 'uint64', field: 1 },
});

const blog = defineProto({
  MsgCreatePost,
  MsgCreatePostResponse,
}, 'mychain.blog.v1');

// Fully typed — TypeScript infers the message shape from the schema
await rivet.signAndBroadcast({
  messages: [blog.CreatePost({
    author: myAddr,
    title: 'Hello',
    body: 'World',
    tags: ['intro'],
  })],
});
```

Supported field types: `string`, `bytes`, `uint64`, `int64`, `uint32`, `int32`, `bool`, `enum`, nested messages, and repeated arrays. The wire format is cross-validated against CosmJS.

This doesn't replace codegen for large APIs with dozens of message types — but for a chain with 3-5 custom messages, it means you never touch `.proto` files or maintain generated code.

## defineProto — Bring Your Own Codegen

If you already have ts-proto or cosmjs-types output, `defineProto` wraps those codecs into typed, callable helpers. It classifies by naming convention: `Msg${X}` becomes a message helper, `Msg${X}Response` gets paired for response decoding, `Query${X}Request`/`Query${X}Response` become query helpers.

```typescript
import { defineProto } from '@rebarxyz/rivet';
import {
  MsgSend, MsgSendResponse,
  QueryBalanceRequest, QueryBalanceResponse,
  protobufPackage,
} from './generated/cosmos/bank/v1beta1/tx';

const bank = defineProto({
  MsgSend, MsgSendResponse,
  QueryBalanceRequest, QueryBalanceResponse,
}, protobufPackage);

// Encode a message (ready for signAndBroadcast)
const msg = bank.Send({ fromAddress, toAddress, amount });

// Decode a response from a broadcast result
const decoded = bank.Send.decodeResponse(broadcastResult);

// Query
const bal = await bank.Balance(rivet, { address, denom });
```

## Wallet Support

### Browser — Keplr / Leap

Wallet signers satisfy `OfflineDirectSigner` via structural typing — no wallet SDK imports needed:

```typescript
const offlineSigner = await window.keplr.getOfflineSignerAuto('cosmoshub-4');
const rivet = Rivet.connect('https://rpc.cosmos.network', {
  wallet: offlineSigner,
  gasConfig: { gasPrice: '0.025uatom' },
});
```

### Server — HD Wallet

The HD wallet lives in a separate entry point so browser bundles don't pull in BIP-32 key derivation:

```typescript
import { Rivet } from '@rebarxyz/rivet';
import { HDWallet } from '@rebarxyz/rivet/wallet';

const wallet = HDWallet.fromMnemonic(process.env.MNEMONIC, { prefix: 'cosmos' });
const rivet = Rivet.connect('https://rpc.cosmos.network', {
  wallet,
  gasConfig: { gasPrice: '0.025uatom' },
});
```

### Read-Only

```typescript
const rivet = Rivet.connect('https://rpc.cosmos.network');
const balance = await bank.Balance(rivet, { address: 'cosmos1...', denom: 'uatom' });
```

## WebSocket Subscriptions

Subscribe to blocks and transactions in real time. The WebSocket connection handles reconnection with exponential backoff, heartbeat monitoring, and automatic resubscription.

```typescript
// Callback-based
const unsub = rivet.subscribeBlocks((block) => {
  console.log(`Block ${block.height} at ${block.time}`);
});

// Filter transactions by event
const unsub2 = rivet.subscribeTxs(
  "message.action='/cosmos.bank.v1beta1.MsgSend'",
  (tx) => console.log(`Transfer in block ${tx.height}: ${tx.hash}`),
);

// Async generator — works with for-await
for await (const block of rivet.streamBlocks()) {
  console.log(`Block ${block.height}`);
}

// Clean up
rivet.unsubscribeAll();
```

Multiple callbacks per query are supported — each `subscribe()` returns its own unsubscribe function. The underlying RPC subscription is shared and cleaned up when the last listener unsubscribes.

## Broadcasting

Three modes depending on your latency/reliability tradeoff:

| Mode | Behavior | Use when |
|---|---|---|
| `sync` (default) | Returns after CheckTx passes | You'll confirm inclusion yourself |
| `confirm` | Broadcasts sync, then polls until block inclusion | You want confirmation without the fragility of `commit` |

```typescript
// Default — returns after CheckTx
const { broadcastResponse } = await rivet.signAndBroadcast({ messages });

// Wait for block inclusion
const { broadcastResponse } = await rivet.signAndBroadcast(
  { messages },
  { mode: 'confirm' },
);
console.log(`Included at height ${broadcastResponse.height}`);
```

`confirm` mode is generally what you want for server-side applications. It avoids the CometBFT `broadcast_tx_commit` endpoint (which can time out under load) by doing sync broadcast + polling.

## gRPC-Web Queries

By default, queries go through the Tendermint RPC (ABCI). If your node exposes a gRPC-web endpoint, Rivet can use it instead — this bypasses the ABCI mutex during block production, so queries don't stall while the node is processing transactions.

```typescript
const rivet = Rivet.connect('https://rpc.cosmos.network', {
  wallet,
  gasConfig: { gasPrice: '0.025uatom' },
  grpcUrl: 'https://grpc.cosmos.network',
});

// Queries automatically route through gRPC-web; broadcasts still use RPC
const balance = await bank.Balance(rivet, { address, denom });
```

Transactions always go through the Tendermint RPC regardless — gRPC-web only affects query routing.

## Testing with Mocks

Rivet ships a mock client that records all interactions and lets you control responses:

```typescript
import { createMockRivet } from '@rebarxyz/rivet/mock';

const mock = createMockRivet();

// Use it like a real client
await mock.signAndBroadcast({ messages: [bank.Send({ ... })] });

// Assert on recorded calls
expect(mock.state.broadcasts).toHaveLength(1);
expect(mock.state.broadcasts[0].result.code).toBe(0);

// Custom handlers for specific test scenarios
mock
  .onSimulate(() => ({ gasUsed: 500_000n }))
  .onBroadcast(() => ({ code: 5, hash: '...', log: 'insufficient funds' }));

// Emit WebSocket events for subscription tests
mock.subscribeBlocks((block) => { ... });
mock.emitBlock();

// Clean up between tests
mock.reset();
```

No running node, no Docker, no test fixtures. The mock satisfies the same `QueryClient` interface as a real Rivet instance.

## Errors

All errors are typed and carry structured context:

```
RivetError
  BroadcastError
    InsufficientFundsError
    SequenceMismatchError    { expected, actual }
    OutOfGasError            { gasUsed, gasWanted }
    UnauthorizedError
  SimulationError
  AccountNotFoundError
  RpcError
  TimeoutError
  SigningRejectedError
```

Broadcast errors are automatically classified from error codes and raw logs — you get `SequenceMismatchError` with the expected/actual sequence numbers parsed out, not a raw string you have to regex yourself. Private keys and mnemonics are never included in error messages.

## Hand-coded Proto Types

Rivet hand-codes the ~15 Cosmos SDK protobuf types that form the transaction envelope — signing, simulating, broadcasting, and parsing responses — so you don't need a protobuf runtime:

| Proto Package | Types | Role |
|---|---|---|
| `cosmos.tx.v1beta1` | TxBody, AuthInfo, Fee, SignerInfo, ModeInfo, SignDoc, TxRaw, Tx, SimulateRequest, SimulateResponse | Transaction structure and simulation |
| `cosmos.base.v1beta1` | Coin | Fee amounts |
| `cosmos.base.abci.v1beta1` | TxMsgData, GasInfo, Result | Broadcast response parsing |
| `cosmos.auth.v1beta1` | BaseAccount, QueryAccountRequest, QueryAccountResponse | Account lookup for signing |
| `cosmos.crypto.secp256k1` | PubKey | Signer identity |
| `google.protobuf` | Any | Message wrapping |

Everything *inside* the messages — your MsgSend, MsgDelegate, custom chain messages, query responses — comes from either the built-in modules, `defineMessage`, or your own codegen.

## Not in Scope

Rivet is SIGN_MODE_DIRECT only. No Amino signing, no Ledger integration, no multisig, no EVM/ethermint chains. Only secp256k1 keys. No IBC types in the built-in protos (though IBC messages work as pre-encoded `Any` values via your own codegen or `defineMessage`).

## Comparison

| | Rivet | CosmJS | InterchainJS |
|---|---|---|---|
| Packages to install | 1 | 4-6 | 5+ |
| Bundle size (minified + gzipped) | ~12 KB | ~300 KB | ~1.4 MB |
| Protobuf runtime | Hand-coded (15 types) | `protobufjs` | `@bufbuild/protobuf` |
| Built-in modules | bank, staking, gov, distribution | Via `cosmjs-types` + registry | Via codegen packages |
| Zero-codegen messages | `defineMessage` | No | No |
| Mock client | Built-in | No | No |
| WebSocket subscriptions | Built-in (auto-reconnect) | Via Tendermint client | Via Tendermint client |
| gRPC-web queries | Built-in | No | Separate package |
| Tree-shakeable | Yes (`sideEffects: false`) | Partial | Partial |
| Message registration | `defineProto` auto-classifies | Manual `registry.register()` | Manual codec setup |
| Amino signing | No | Yes | Yes |
| Ledger support | No | Yes | Yes |
| Multisig | No | Yes | Yes |
| EVM/ethermint | No | Limited | Yes |
| Key algorithms | secp256k1 | secp256k1, ed25519 | secp256k1, ed25519, ethsecp256k1 |

## Dependencies

| Dependency | Purpose | Size |
|---|---|---|
| `@noble/curves` | secp256k1 sign/verify/pubkey | ~33 KB gzipped |
| `@noble/hashes` | SHA-256, RIPEMD-160, PBKDF2 | (dep of @noble/curves) |
| `bech32` | Address encoding | ~3 KB |
| `@scure/bip32` (optional) | HD key derivation, `@rebarxyz/rivet/wallet` only | ~36 KB |

## Testing

318 tests across 18 files. The cross-validation suite does byte-for-byte differential testing against CosmJS: address derivation, proto encoding, signing, full tx pipeline roundtrips, wallet compatibility (CosmJS/Keplr response format handling), and wire format verification for `defineMessage`.

```bash
pnpm test
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module diagrams, the signing flow, and entry point tree-shaking details.
