import type { WebSocketOptions } from '../types.js';

export interface SubscriptionEvent {
  query: string;
  data?: Record<string, unknown>;
  events?: Record<string, string[]>;
}

interface PendingRpc {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

/**
 * Managed WebSocket connection to a CometBFT /websocket endpoint.
 *
 * Handles JSON-RPC 2.0 subscribe/unsubscribe, heartbeat-based reconnection,
 * exponential backoff, and automatic resubscription after reconnect.
 *
 * Supports multiple callbacks per query — each `subscribe()` call returns an
 * independent unsubscribe function. The underlying RPC subscription is sent
 * once per unique query and removed when the last callback is unsubscribed.
 */
export class RivetWebSocket {
  private ws: WebSocket | null = null;
  readonly url: string;
  private readonly heartbeatTimeout: number;
  private readonly maxReconnectDelay: number;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRpc>();
  private readonly subscriptions = new Map<string, Set<(event: unknown) => void>>();
  private closed = false;

  constructor(rpcEndpoint: string, options?: WebSocketOptions) {
    this.url = deriveWsUrl(rpcEndpoint);
    this.heartbeatTimeout = options?.heartbeatTimeout ?? 30_000;
    this.maxReconnectDelay = options?.maxReconnectDelay ?? 30_000;
  }

  /** Number of active query subscriptions (unique queries, not callbacks). */
  get subscriptionCount(): number {
    return this.subscriptions.size;
  }

  connect(): void {
    if (this.closed) return;
    if (!globalThis.WebSocket) {
      throw new Error(
        'No WebSocket implementation found. ' +
        'Native WebSocket is available in browsers, Bun, and Node >= 22. ' +
        'For Node 20, launch with --experimental-websocket.',
      );
    }
    this.ws = new globalThis.WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.resetHeartbeat();
      for (const [query] of this.subscriptions) {
        this._sendSubscribe(query).catch(() => {
          // Resubscription failures are handled by heartbeat-triggered reconnect
        });
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.resetHeartbeat();
      try {
        const data = JSON.parse(String(event.data)) as Record<string, unknown>;
        this.handleMessage(data);
      } catch {
        // Ignore unparseable messages
      }
    };

    this.ws.onclose = () => {
      this.clearHeartbeat();
      if (!this.closed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, which handles reconnection
    };
  }

  /**
   * Subscribe to a CometBFT query. Returns an unsubscribe function.
   *
   * Multiple callbacks can be registered for the same query — they all share
   * one underlying RPC subscription. Auto-connects if not already connected.
   */
  subscribe(query: string, callback: (event: unknown) => void): () => void {
    let callbacks = this.subscriptions.get(query);
    const isNewQuery = !callbacks;

    if (!callbacks) {
      callbacks = new Set();
      this.subscriptions.set(query, callbacks);
    }
    callbacks.add(callback);

    // Auto-connect and subscribe if needed
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
      // The onopen handler will send subscribe RPCs for all queries
    } else if (isNewQuery) {
      this._sendSubscribe(query).catch(() => {
        // Will resubscribe on reconnect
      });
    }

    return () => {
      const set = this.subscriptions.get(query);
      if (!set) return;
      set.delete(callback);
      if (set.size === 0) {
        this.subscriptions.delete(query);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this._sendUnsubscribe(query).catch(() => {});
        }
      }
    };
  }

  close(): void {
    this.closed = true;
    this.clearHeartbeat();
    this.subscriptions.clear();
    for (const [, rpc] of this.pending) {
      rpc.reject(new Error('WebSocket closed'));
    }
    this.pending.clear();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private handleMessage(data: Record<string, unknown>): void {
    const id = data['id'];

    // RPC response — id is the integer we sent. CometBFT subscription events
    // carry a string id like "1#event", so the typeof check prevents misrouting.
    if (typeof id === 'number' && this.pending.has(id)) {
      const rpc = this.pending.get(id)!;
      this.pending.delete(id);
      if (data['error']) {
        rpc.reject(new Error(JSON.stringify(data['error'])));
      } else {
        rpc.resolve(data['result']);
      }
      return;
    }

    // Subscription event — routed by query string, not id
    const result = data['result'] as Record<string, unknown> | undefined;
    if (!result) return;

    const query = result['query'] as string | undefined;
    if (!query) return;

    const callbacks = this.subscriptions.get(query);
    if (callbacks) {
      for (const cb of callbacks) {
        cb(result);
      }
    }
  }

  private _sendSubscribe(query: string): Promise<unknown> {
    return this.sendRpc('subscribe', { query });
  }

  private _sendUnsubscribe(query: string): Promise<unknown> {
    return this.sendRpc('unsubscribe', { query });
  }

  private sendRpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }));
    });
  }

  private resetHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setTimeout(() => {
      // No message received within timeout — force close and reconnect via backoff
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.close();
      }
      this.ws = null;
      if (!this.closed) {
        this.scheduleReconnect();
      }
    }, this.heartbeatTimeout);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay,
    );
    this.reconnectAttempts++;
    setTimeout(() => {
      if (!this.closed) this.connect();
    }, delay);
  }
}

// ---------------------------------------------------------------------------
// URL derivation
// ---------------------------------------------------------------------------

/** Convert an HTTP(S) RPC endpoint to a WebSocket URL. */
export function deriveWsUrl(rpcEndpoint: string): string {
  let url = rpcEndpoint;
  if (url.startsWith('https://')) {
    url = 'wss://' + url.slice(8);
  } else if (url.startsWith('http://')) {
    url = 'ws://' + url.slice(7);
  }
  if (!url.endsWith('/websocket')) {
    url = url.replace(/\/$/, '') + '/websocket';
  }
  return url;
}
