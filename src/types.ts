export interface Event {
  type: string;
  attributes: Record<string, string>;
}

export interface BroadcastResponse {
  hash: Uint8Array;
  code: number;
  data?: Uint8Array;
  gasUsed: bigint;
  gasWanted: bigint;
  log: string;
  events: Event[];
  info: string;
  height?: bigint;
}

export interface BroadcastCommitResponse extends BroadcastResponse {
  height: bigint;
  checkTx: {
    code: number;
    log: string;
    data?: Uint8Array;
    gasUsed: bigint;
    gasWanted: bigint;
    events: Event[];
    info: string;
  };
  txResult: {
    code: number;
    log: string;
    data?: Uint8Array;
    gasUsed: bigint;
    gasWanted: bigint;
    events: Event[];
    info: string;
  };
}

export type BroadcastSyncResponse = BroadcastResponse;

export interface TxResponse {
  tx: Uint8Array;
  txResult: {
    code: number;
    log: string;
    data?: Uint8Array;
    gasUsed: bigint;
    gasWanted: bigint;
    events: Event[];
  };
  height: number;
  hash: Uint8Array;
}

export interface SignerConfig {
  rpcUrl: string;
  /** gRPC-web endpoint for queries. If set, account lookups and simulation bypass the ABCI mutex. */
  grpcUrl?: string;
  /** Chain ID. If omitted, fetched from the node on first signing operation. */
  chainId?: string;
  gasConfig?: {
    multiplier?: number;
    gasPrice?: string;
  };
  /** WebSocket options for the shared subscription connection. */
  ws?: WebSocketOptions;
}

export interface WebSocketOptions {
  /** Heartbeat timeout in ms. If no message received within this period, reconnect. Default: 30000. */
  heartbeatTimeout?: number;
  /** Maximum reconnection delay in ms (exponential backoff caps here). Default: 30000. */
  maxReconnectDelay?: number;
}

/** Anything that can deliver a protobuf query to the chain and return raw response bytes. */
export interface QueryClient {
  query(path: string, data: Uint8Array): Promise<Uint8Array>;
}
