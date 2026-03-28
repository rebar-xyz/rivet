import { describe, it, expect } from 'vitest';
import { Reader, Writer } from '../src/proto/wire';

describe('Reader bounds checks', () => {
  it('throws on truncated varint32', () => {
    // 0x80 = continuation bit set, but no following byte
    const buf = new Uint8Array([0x80]);
    const r = new Reader(buf);
    expect(() => r.readVarint32()).toThrow('Unexpected end of protobuf data');
  });

  it('throws on truncated varint64', () => {
    const buf = new Uint8Array([0x80]);
    const r = new Reader(buf);
    expect(() => r.readVarint64()).toThrow('Unexpected end of protobuf data');
  });

  it('throws on empty buffer varint read', () => {
    const r = new Reader(new Uint8Array(0));
    expect(() => r.readVarint32()).toThrow('Unexpected end of protobuf data');
  });

  it('throws when readBytes length exceeds buffer', () => {
    // Varint 10 (length = 10) followed by only 2 bytes
    const buf = new Uint8Array([10, 0xAA, 0xBB]);
    const r = new Reader(buf);
    expect(() => r.readBytes()).toThrow('exceeds buffer bounds');
  });

  it('throws when skip(1) exceeds buffer for 64-bit wire type', () => {
    // Only 4 bytes available but wire type 1 needs 8
    const buf = new Uint8Array([0, 0, 0, 0]);
    const r = new Reader(buf);
    expect(() => r.skip(1)).toThrow('Unexpected end of protobuf data');
  });

  it('throws when skip(2) length exceeds buffer', () => {
    // Varint 20 (length = 20) but only 5 bytes of data
    const buf = new Uint8Array([20, 1, 2, 3, 4, 5]);
    const r = new Reader(buf);
    expect(() => r.skip(2)).toThrow('exceeds buffer bounds');
  });

  it('throws when skip(5) exceeds buffer for 32-bit wire type', () => {
    const buf = new Uint8Array([0, 0]);
    const r = new Reader(buf);
    expect(() => r.skip(5)).toThrow('Unexpected end of protobuf data');
  });

  it('valid data still decodes correctly', () => {
    const w = new Writer();
    w.fieldString(1, 'hello');
    const data = w.finish();

    const r = new Reader(data);
    const [field, wire] = r.readTag();
    expect(field).toBe(1);
    expect(wire).toBe(2);
    expect(r.readString()).toBe('hello');
    expect(r.done).toBe(true);
  });
});
