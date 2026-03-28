import { RpcError } from '../errors.js';
import type { QueryClient } from '../types.js';

/**
 * Query transport that routes through the Cosmos SDK gRPC-web server,
 * avoiding ABCI mutex contention during block production.
 */
export class GrpcClient implements QueryClient {
  constructor(
    private readonly endpoint: string,
    private readonly headers?: Record<string, string>,
  ) {}

  async query(path: string, data: Uint8Array): Promise<Uint8Array> {
    const url = `${this.endpoint}${path}`;
    const body = encodeFrame(data);

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/grpc-web+proto',
          'X-Grpc-Web': '1',
          ...this.headers,
        },
        body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
      });
    } catch (err) {
      throw new RpcError(`Failed to reach gRPC endpoint: ${err}`, this.endpoint);
    }

    if (!resp.ok) {
      throw new RpcError(`gRPC HTTP ${resp.status}: ${resp.statusText}`, this.endpoint, resp.status);
    }

    const grpcStatus = resp.headers.get('grpc-status');
    if (grpcStatus && grpcStatus !== '0') {
      const grpcMessage = resp.headers.get('grpc-message') ?? 'unknown gRPC error';
      throw new RpcError(
        `gRPC error (status ${grpcStatus}): ${decodeURIComponent(grpcMessage)}`,
        this.endpoint,
      );
    }

    const buffer = await resp.arrayBuffer();
    return decodeResponse(new Uint8Array(buffer));
  }
}

/**
 * Encode a protobuf message into a gRPC-web length-prefixed frame.
 * Frame format: 1 byte flags (0x00) + 4 bytes big-endian length + payload.
 */
export function encodeFrame(data: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + data.length);
  // flags byte: 0x00 = uncompressed data frame
  frame[0] = 0x00;
  // 4-byte big-endian message length
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(1, data.length, false);
  frame.set(data, 5);
  return frame;
}

/**
 * Decode a gRPC-web response, extracting the first data frame's payload.
 * Skips trailer frames (flags byte has bit 0x80 set).
 */
export function decodeResponse(buffer: Uint8Array): Uint8Array {
  if (buffer.length < 5) {
    return new Uint8Array(0);
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const flags = buffer[0]!;

  // Trailer frame (bit 7 set) — no data payload
  if (flags & 0x80) {
    return new Uint8Array(0);
  }

  const length = view.getUint32(1, false);
  if (5 + length > buffer.length) {
    return new Uint8Array(0);
  }

  return buffer.slice(5, 5 + length);
}
