import { RpcError } from '../errors.js';

/** HTTP JSON-RPC client for Tendermint/CometBFT endpoints. */
export class TendermintRpc {
  constructor(
    private readonly endpoint: string,
    private readonly headers?: Record<string, string>,
  ) {}

  get url(): string {
    return this.endpoint;
  }

  async call(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = Math.floor(Math.random() * (10 ** 12 - 10 ** 11) + 10 ** 11);

    const body = JSON.stringify({
      id,
      jsonrpc: '2.0',
      method,
      params,
    });

    let resp: Response;
    try {
      resp = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers },
        body,
      });
    } catch (err) {
      throw new RpcError(`Failed to reach RPC endpoint: ${err}`, this.endpoint);
    }

    let json: Record<string, unknown>;
    try {
      json = await resp.json() as Record<string, unknown>;
    } catch {
      throw new RpcError(`Invalid JSON response (status ${resp.status})`, this.endpoint, resp.status);
    }

    if (!resp.ok) {
      throw new RpcError(`HTTP ${resp.status}: ${resp.statusText}`, this.endpoint, resp.status);
    }

    if (json['error'] != null) {
      const rpcErr = json['error'] as Record<string, unknown>;
      throw new RpcError(
        `RPC error: ${rpcErr['message'] ?? JSON.stringify(rpcErr)}`,
        this.endpoint,
      );
    }

    return json['result'];
  }

  /** Fetch the chain ID from the node's /status endpoint. */
  async getChainId(): Promise<string> {
    const result = await this.call('status', {}) as Record<string, unknown>;
    const nodeInfo = result['node_info'] as Record<string, unknown> | undefined;
    if (!nodeInfo) {
      throw new RpcError('Missing node_info in status response', this.endpoint);
    }
    return nodeInfo['network'] as string;
  }

  /**
   * ABCI query — used for account lookups and simulation.
   * Returns raw bytes decoded from the base64 response value.
   */
  async query(path: string, data: Uint8Array): Promise<Uint8Array> {
    const result = await this.call('abci_query', {
      path,
      data: toHex(data),
      prove: false,
    }) as Record<string, unknown>;

    const response = result['response'] as Record<string, unknown>;
    if (!response) {
      throw new RpcError('Missing response in ABCI query result', this.endpoint);
    }

    const code = response['code'] as number | undefined;
    if (code && code !== 0) {
      const log = response['log'] as string | undefined;
      throw new RpcError(`ABCI query failed (code ${code}): ${log ?? 'unknown'}`, this.endpoint);
    }

    const value = response['value'] as string | undefined;
    if (!value) {
      return new Uint8Array(0);
    }

    return fromBase64(value);
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromBase64(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(str, 'base64'));
  }
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
