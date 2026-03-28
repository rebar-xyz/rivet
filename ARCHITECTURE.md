# Architecture

Internal architecture details for contributors and maintainers.

## System Context

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser App                                                        │
│                                                                     │
│  @interchain-kit/react ──► Keplr / Leap extension                  │
│         │                        │                                  │
│         │ wallet UI               │ window.keplr.getOfflineSignerAuto()
│         │ management              │                                  │
│         └────────┐               │                                  │
│                  ▼               ▼                                  │
│            OfflineDirectSigner                                      │
│            { getAccounts(), signDirect() }                          │
│                       │                                             │
│                       ▼                                             │
│  ┌──────────────────────────────────────┐                          │
│  │    @rebarxyz/rivet                  │                          │
│  │    Rivet.signAndBroadcast()          │                          │
│  └──────────────┬───────────────────────┘                          │
│                 │                                                    │
│                 ▼                                                    │
│  ┌──────────────────────────────────────┐                          │
│  │    Consumer SDK / App logic          │                          │
│  └──────────────┬───────────────────────┘                          │
└─────────────────┼───────────────────────────────────────────────────┘
                  │ JSON-RPC over HTTP
                  ▼
         ┌─────────────────┐
         │  Cosmos Chain    │
         │  (CometBFT)      │
         └─────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Server App                                                         │
│                                                                     │
│  ┌──────────────────────────────────────┐                          │
│  │  @rebarxyz/rivet/wallet             │  ◄── separate entry point│
│  │  HDWallet.fromMnemonic(...)          │      (pulls @scure/bip32)│
│  └──────────────┬───────────────────────┘                          │
│                 │ implements OfflineDirectSigner                     │
│                 ▼                                                    │
│  ┌──────────────────────────────────────┐                          │
│  │  Rivet.signAndBroadcast()            │                          │
│  └──────────────┬───────────────────────┘                          │
└─────────────────┼───────────────────────────────────────────────────┘
                  │ JSON-RPC over HTTP
                  ▼
         ┌─────────────────┐
         │  Cosmos Chain    │
         └─────────────────┘
```

The `OfflineDirectSigner` interface uses TypeScript structural typing, so Keplr's `getOfflineSignerAuto()` and @interchain-kit's `getOfflineSigner()` satisfy it without any import dependency.

## Internal Module Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Entry Points                                 │
│                                                                     │
│   index.ts ─────────────────────────────  wallet.ts                 │
│   (main entry: signer + messages +       (HD wallet entry:          │
│    rpc + proto + wallet types + errors)    HDWallet + Secp256k1Wallet│
│                                            + wallet types)          │
└──────┬──────────────────────────────────────────┬───────────────────┘
       │                                          │
       ▼                                          ▼
┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────────────┐
│   signer.ts  │  │proto-helpers │  │ types.ts │  │errors.ts│  │    wallet/           │
│              │  │   .ts        │  │          │  │         │  │                      │
│ Rivet        │  │defineProto   │  │Response  │  │7 error  │  │ types.ts             │
│              │  │createDecoder │  │types,    │  │classes  │  │  OfflineDirectSigner │
│ Orchestrates │  │  Map         │  │signer    │  │         │  │  AccountData         │
│ all modules  │  │              │  │config    │  │         │  │  DirectSignResponse  │
│ below        │  │              │  │          │  │         │  │                      │
└──┬───┬───┬───┘  └──────────────┘  └──────────┘  └─────────┘  │ secp256k1.ts         │
   │   │   │                                  │  Secp256k1Wallet     │
   │   │   │                                  │  (from raw privkey)  │
   │   │   │                                  │                      │
   │   │   │                                  │ hd.ts                │
   │   │   │                                  │  HDWallet            │
   │   │   │                                  │  (from BIP-39)       │
   │   │   │                                  └──────────┬───────────┘
   │   │   │                                             │
   ▼   ▼   ▼                                             ▼
┌──────────┐  ┌────────────┐  ┌──────────────────────────────────────┐
│  rpc/    │  │   tx/      │  │              proto/                  │
│          │  │            │  │                                      │
│client.ts │  │ build.ts   │  │ wire.ts ── Writer/Reader (varint,   │
│ Tendermint│  │  buildTxBody│  │            length-delimited)        │
│ Rpc      │  │  buildAuth │  │                                      │
│ (fetch)  │  │  buildSign │  │ tx.ts ──── TxBody, AuthInfo, SignDoc,│
│          │  │  Doc       │  │            TxRaw, Tx, Fee, SignerInfo│
│broadcast │  │            │  │            ModeInfo, SignMode        │
│ .ts      │  │ encode.ts  │  │                                      │
│          │  │  encodeTx  │  │ coin.ts ── Coin                      │
│simulate  │  │  Raw       │  │ any.ts ─── Any                       │
│ .ts      │  │  encode    │  │ keys.ts ── PubKey                    │
│          │  │  Message   │  │ auth.ts ── BaseAccount               │
│account   │  │            │  │ abci.ts ── TxMsgData,                │
│ .ts      │  │ decode.ts  │  │            SimulateRequest/Response  │
│          │  │  decodeTx  │  │                                      │
│search.ts │  │  decodeTx  │  └──────────────────────────────────────┘
│          │  │  MsgData   │
│          │  │            │  ┌──────────────────────────────────────┐
│          │  │ fee.ts     │  │             crypto/                  │
│          │  │  calculate │  │                                      │
│          │  │  Fee       │  │ secp256k1.ts ── sign, verify,       │
│          │  │  applyGas  │  │                 getPublicKey         │
│          │  │  Multiplier│  │ hash.ts ─────── sha256, ripemd160   │
│          │  │            │  │ address.ts ──── pubkeyToAddress      │
└──────────┘  └────────────┘  └──────────────────────────────────────┘
                                             │
                                             ▼
                              ┌──────────────────────────────────────┐
                              │         External Dependencies        │
                              │                                      │
                              │  @noble/curves ── secp256k1          │
                              │  @noble/hashes ── SHA-256, RIPEMD-160│
                              │  bech32 ───────── address encoding   │
                              │  @scure/bip32 ─── HD key derivation  │
                              │     (optional, wallet entry only)    │
                              └──────────────────────────────────────┘
```

## Transaction Signing Flow

The `signAndBroadcast` pipeline. Messages arrive pre-encoded via `defineProto` message helpers.

```
signAndBroadcast(messages, fee?, memo?, options?)
│
│  messages = [{ typeUrl: string, value: Uint8Array }]  ◄── pre-encoded by defineProto helpers
│
│ ① wallet.getAccounts()
│   └─► AccountData { address, pubkey, algo }
│
│ ② Promise.all([                              ┌───────────────────┐
│      getAccount(rpc, address), ──────────────►│ Chain (ABCI query)│
│      rpc.getChainId()         ──────────────►│ /status           │
│    ])                                         └───────────────────┘
│   └─► { accountNumber, sequence, chainId }
│
│ ③ buildTxBody(messages, { memo, unordered, timeoutTimestamp })
│   │  TxBody.encode({ messages, memo, ... })
│   └─► bodyBytes: Uint8Array
│
│ ④ fee provided? ────── YES ──► use as-is
│   │
│   NO (auto gas estimation)
│   │  buildAuthInfo(pubkey, seq, zeroFee) ──► simAuthInfo
│   │  encodeTxRaw(body, simAuthInfo, [zeros]) ──► simTxBytes
│   │  simulateTx(rpc, simTxBytes) ─────────────►┌───────────────────┐
│   │     └─► gasUsed                             │ Chain (ABCI query)│
│   │  applyGasMultiplier(gasUsed, 1.75)          │ /Simulate         │
│   │     └─► gasLimit                            └───────────────────┘
│   │  calculateFee(gasLimit, gasPrice)
│   └─► fee: { amount: Coin[], gasLimit }
│
│ ⑤ buildAuthInfo({ pubkey, sequence, DIRECT }, fee)
│   │  Wraps pubkey in Any(/cosmos.crypto.secp256k1.PubKey)
│   │  Sets SignMode.DIRECT, encodes SignerInfo + Fee
│   └─► authInfoBytes: Uint8Array
│
│ ⑥ SignDoc = { bodyBytes, authInfoBytes, chainId, accountNumber }
│   │  wallet.signDirect(address, signDoc)
│   │     └─► wallet hashes SignDoc bytes (SHA-256)
│   │         signs hash with secp256k1 private key
│   └─► DirectSignResponse { signed, signature (64-byte compact r‖s) }
│
│ ⑦ encodeTxRaw(signed.bodyBytes, signed.authInfoBytes, [signature])
│   │  TxRaw.encode({ bodyBytes, authInfoBytes, signatures })
│   └─► txBytes: Uint8Array
│
│ ⑧ broadcastTxSync(rpc, txBytes) ────────────►┌───────────────────┐
│      or broadcastTxConfirm(rpc, txBytes)      │ Chain (JSON-RPC)  │
│   └─► sync: BroadcastSyncResponse             │ broadcast_tx_sync │
│        confirm: sync + poll tx by hash        │ tx (polling)      │
│        until block inclusion → TxResponse     └───────────────────┘
│
│   code !== 0? ──► throw BroadcastError / InsufficientFundsError
│
└─► { broadcastResponse }
```

Chain ID is lazily resolved from the node on first use if not provided in config.

## Entry Point Tree-Shaking

```
@rebarxyz/rivet  (index.ts)
├── Rivet              ── signer + rpc + tx + proto
├── defineProto        ── proto-helpers (message & query encoding)
├── TendermintRpc           ── rpc/client (fetch only)
├── build/encode/decode     ── tx/ (pure functions)
├── Proto types             ── proto/ (Coin, Any, TxBody, etc)
├── Secp256k1Wallet         ── wallet/secp256k1 + crypto/
├── Error classes           ── errors
└── Type exports            ── types, wallet/types

@rebarxyz/rivet/wallet  (wallet.ts)      ◄── separate chunk
├── HDWallet                ── wallet/hd + crypto/
│   └── @scure/bip32        ── HD key derivation (~36 KB)
│   └── @noble/hashes/pbkdf2── mnemonic → seed
├── Secp256k1Wallet         ── (re-exported)
└── Type exports            ── (re-exported)

Dependency graph (what pulls what):
─────────────────────────────────
  Rivet ──► rpc/* ──► errors
      │       ──► tx/*  ──► proto/*
      │       ──► proto/*
      └───────── wallet/types (interface only)

  defineProto ──► tx/decode (decodeTxMsgData)
              ──► types (BroadcastResponse, RpcClient)

  Secp256k1Wallet ──► crypto/secp256k1 ──► @noble/curves
                  ──► crypto/hash      ──► @noble/hashes
                  ──► crypto/address   ──► bech32

  HDWallet ──► Secp256k1Wallet (extends)
           ──► @scure/bip32
           ──► @noble/hashes/pbkdf2, sha512
```

## Address Derivation Pipeline

```
Mnemonic (24 words)
  │
  │ PBKDF2-HMAC-SHA512("mnemonic" + passphrase, 2048 rounds)
  ▼
512-bit Seed
  │
  │ BIP-32 derivation: m/44'/118'/0'/0/0
  ▼
32-byte Private Key
  │
  │ secp256k1 point multiplication (compressed)
  ▼
33-byte Public Key (02/03 prefix + 32-byte x-coordinate)
  │
  │ SHA-256
  ▼
32-byte hash
  │
  │ RIPEMD-160
  ▼
20-byte hash
  │
  │ bech32 encode with human-readable prefix
  ▼
Address: "cosmos1..."
```

## Proto Wire Format

The 15 protobuf types are hand-coded using a minimal `Writer`/`Reader` in `proto/wire.ts` (~220 lines). These are stable Cosmos SDK v1beta1 types that haven't changed in years. Each type has `encode()`, `decode()`, and `fromPartial()` methods.

No `@bufbuild/protobuf` or `protobufjs` dependency. The wire format implementation supports varint (wire type 0) and length-delimited (wire type 2) — the only wire types used by Cosmos SDK transaction types.
