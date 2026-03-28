import { describe, it, expect } from 'vitest';
import { encodeFrame, decodeResponse } from '../src/rpc/grpc';

describe('gRPC-web framing', () => {
  it('encodeFrame produces correct length-prefixed frame', () => {
    const data = new Uint8Array([0x0a, 0x0b, 0x0c]);
    const frame = encodeFrame(data);

    expect(frame.length).toBe(5 + 3);
    // flags byte
    expect(frame[0]).toBe(0x00);
    // big-endian length = 3
    expect(frame[1]).toBe(0);
    expect(frame[2]).toBe(0);
    expect(frame[3]).toBe(0);
    expect(frame[4]).toBe(3);
    // payload
    expect(frame.slice(5)).toEqual(data);
  });

  it('encodeFrame handles empty payload', () => {
    const frame = encodeFrame(new Uint8Array(0));
    expect(frame.length).toBe(5);
    expect(frame[0]).toBe(0x00);
    expect(frame[4]).toBe(0);
  });

  it('decodeResponse extracts payload from data frame', () => {
    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const frame = encodeFrame(payload);
    const result = decodeResponse(frame);
    expect(result).toEqual(payload);
  });

  it('decodeResponse returns empty for trailer frame', () => {
    const frame = new Uint8Array([0x80, 0, 0, 0, 5, 0, 0, 0, 0, 0]);
    const result = decodeResponse(frame);
    expect(result.length).toBe(0);
  });

  it('decodeResponse returns empty for buffer too short', () => {
    expect(decodeResponse(new Uint8Array(0)).length).toBe(0);
    expect(decodeResponse(new Uint8Array(4)).length).toBe(0);
  });

  it('decodeResponse returns empty when length exceeds buffer', () => {
    // Claims 10 bytes of payload but buffer only has 5 bytes after header
    const frame = new Uint8Array([0x00, 0, 0, 0, 10, 0, 0, 0, 0, 0]);
    const result = decodeResponse(frame);
    expect(result.length).toBe(0);
  });

  it('roundtrips arbitrary data', () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i;
    const result = decodeResponse(encodeFrame(data));
    expect(result).toEqual(data);
  });

  it('encodeFrame handles large payload length correctly', () => {
    const data = new Uint8Array(300);
    const frame = encodeFrame(data);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    expect(view.getUint32(1, false)).toBe(300);
    expect(frame.length).toBe(305);
  });
});
