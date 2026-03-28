// Core client
export { Rivet } from './signer.js';

// Proto helpers
export { defineProto } from './proto-helpers.js';
export type { MessageHelper, QueryHelper, MinimalCodec, DefineProtoResult } from './proto-helpers.js';

// Define message (zero-codegen)
export { defineMessage } from './define-message.js';
export type { FieldDef, ScalarFieldDef, MessageFieldDef, MessageCodec, InferMessage } from './define-message.js';

// Transaction building
export { buildTxBody, buildAuthInfo, buildSignDoc } from './tx/build.js';
export { encodeTxRaw, encodeMessage } from './tx/encode.js';
export { decodeTx, decodeTxMsgData } from './tx/decode.js';
export { calculateFee, applyGasMultiplier } from './tx/fee.js';

// RPC
export { TendermintRpc } from './rpc/client.js';
export { GrpcClient } from './rpc/grpc.js';
export { broadcastTxSync, broadcastTxCommit, broadcastTxConfirm } from './rpc/broadcast.js';
export type { ConfirmOptions } from './rpc/broadcast.js';
export { simulateTx } from './rpc/simulate.js';
export type { SimulationResult } from './rpc/simulate.js';
export { getAccount } from './rpc/account.js';
export { searchTxs, getTx } from './rpc/search.js';

// Proto types
export { TxBody, AuthInfo, SignDoc, TxRaw, Tx, SignMode } from './proto/tx.js';
export type { Fee, SignerInfo, ModeInfo } from './proto/tx.js';
export { Any } from './proto/any.js';
export { Coin } from './proto/coin.js';
export { PubKey } from './proto/keys.js';
export { TxMsgData } from './proto/abci.js';
export type { SimulateResponse, GasInfo, Result } from './proto/abci.js';
export { BaseAccount } from './proto/auth.js';

// Wallet types (always available — no heavy deps)
export type { OfflineDirectSigner, AccountData, DirectSignResponse } from './wallet/types.js';
export { Secp256k1Wallet } from './wallet/secp256k1.js';

// Public types
export type {
  BroadcastResponse,
  BroadcastCommitResponse,
  BroadcastSyncResponse,
  TxResponse,
  Event,
  SignerConfig,
  QueryClient,
  WebSocketOptions,
} from './types.js';

// Errors
export {
  RivetError,
  BroadcastError,
  SimulationError,
  AccountNotFoundError,
  RpcError,
  InsufficientFundsError,
  SequenceMismatchError,
  OutOfGasError,
  UnauthorizedError,
  TimeoutError,
  SigningRejectedError,
} from './errors.js';
export { classifyBroadcastError, parseSequenceMismatch, parseOutOfGas } from './error-classify.js';

// WebSocket subscriptions
export type { NewBlockEvent, TxEvent } from './rpc/subscribe.js';
export { RivetWebSocket, deriveWsUrl } from './rpc/websocket.js';
export type { SubscriptionEvent } from './rpc/websocket.js';
