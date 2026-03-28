/**
 * Minimal protobuf binary encoding/decoding.
 *
 * Supports the wire types used by the Cosmos SDK transaction types:
 * varint (0), length-delimited (2). This is all that's needed for
 * TxBody, AuthInfo, SignDoc, TxRaw, Fee, SignerInfo, Coin, Any,
 * BaseAccount, PubKey, and ABCI response types.
 */

// -- Writer ------------------------------------------------------------------

export class Writer {
  private chunks: Uint8Array[] = [];
  private len = 0;

  uint32(value: number): this {
    this.varint(value >>> 0);
    return this;
  }

  uint64(value: bigint): this {
    this.varint64(value);
    return this;
  }

  int64(value: bigint): this {
    this.varint64(BigInt.asUintN(64, value));
    return this;
  }

  bool(value: boolean): this {
    this.varint(value ? 1 : 0);
    return this;
  }

  bytes(value: Uint8Array): this {
    this.varint(value.length);
    this.raw(value);
    return this;
  }

  string(value: string): this {
    const encoded = new TextEncoder().encode(value);
    this.bytes(encoded);
    return this;
  }

  /** Write a field tag (field number + wire type) */
  tag(fieldNumber: number, wireType: number): this {
    this.varint((fieldNumber << 3) | wireType);
    return this;
  }

  /** Write a nested message field: tag + length-delimited bytes */
  field(fieldNumber: number, data: Uint8Array): this {
    if (data.length === 0) return this;
    this.tag(fieldNumber, 2);
    this.bytes(data);
    return this;
  }

  /** Write a varint field (only if non-zero) */
  fieldVarint(fieldNumber: number, value: number | bigint): this {
    if (typeof value === 'bigint') {
      if (value === 0n) return this;
      this.tag(fieldNumber, 0);
      this.varint64(value);
    } else {
      if (value === 0) return this;
      this.tag(fieldNumber, 0);
      this.varint(value >>> 0);
    }
    return this;
  }

  /** Write a string field (only if non-empty) */
  fieldString(fieldNumber: number, value: string): this {
    if (!value) return this;
    this.tag(fieldNumber, 2);
    this.string(value);
    return this;
  }

  /** Write a bytes field (only if non-empty) */
  fieldBytes(fieldNumber: number, value: Uint8Array): this {
    if (value.length === 0) return this;
    this.tag(fieldNumber, 2);
    this.bytes(value);
    return this;
  }

  /** Write a bool field (only if true) */
  fieldBool(fieldNumber: number, value: boolean): this {
    if (!value) return this;
    this.tag(fieldNumber, 0);
    this.varint(1);
    return this;
  }

  finish(): Uint8Array {
    const result = new Uint8Array(this.len);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  private varint(value: number): void {
    const buf: number[] = [];
    while (value > 0x7f) {
      buf.push((value & 0x7f) | 0x80);
      value >>>= 7;
    }
    buf.push(value & 0x7f);
    this.raw(new Uint8Array(buf));
  }

  private varint64(value: bigint): void {
    const buf: number[] = [];
    while (value > 0x7fn) {
      buf.push(Number(value & 0x7fn) | 0x80);
      value >>= 7n;
    }
    buf.push(Number(value & 0x7fn));
    this.raw(new Uint8Array(buf));
  }

  private raw(data: Uint8Array): void {
    this.chunks.push(data);
    this.len += data.length;
  }
}

// -- Reader ------------------------------------------------------------------

export class Reader {
  private pos = 0;

  constructor(private readonly buf: Uint8Array) {}

  get done(): boolean {
    return this.pos >= this.buf.length;
  }

  /** Read field tag, returns [fieldNumber, wireType] */
  readTag(): [number, number] {
    const v = this.readVarint32();
    return [v >>> 3, v & 0x07];
  }

  readVarint32(): number {
    let result = 0;
    let shift = 0;
    while (shift < 35) {
      if (this.pos >= this.buf.length) throw new Error('Unexpected end of protobuf data');
      const byte = this.buf[this.pos++]!;
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result >>> 0;
      shift += 7;
    }
    throw new Error('varint too long');
  }

  readVarint64(): bigint {
    let result = 0n;
    let shift = 0n;
    while (shift < 70n) {
      if (this.pos >= this.buf.length) throw new Error('Unexpected end of protobuf data');
      const byte = this.buf[this.pos++]!;
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7n;
    }
    throw new Error('varint too long');
  }

  readInt64(): bigint {
    const unsigned = this.readVarint64();
    return BigInt.asIntN(64, unsigned);
  }

  readBool(): boolean {
    return this.readVarint32() !== 0;
  }

  readBytes(): Uint8Array<ArrayBuffer> {
    const len = this.readVarint32();
    if (len < 0 || this.pos + len > this.buf.length) {
      throw new Error('Protobuf length-delimited field exceeds buffer bounds');
    }
    const buf = new ArrayBuffer(len);
    const copy = new Uint8Array(buf);
    for (let i = 0; i < len; i++) {
      copy[i] = this.buf[this.pos + i]!;
    }
    this.pos += len;
    return copy;
  }

  readString(): string {
    return new TextDecoder().decode(this.readBytes());
  }

  /** Skip an unknown field based on wire type */
  skip(wireType: number): void {
    switch (wireType) {
      case 0: // varint
        while (this.pos < this.buf.length && this.buf[this.pos++]! & 0x80) { /* skip */ }
        break;
      case 1: // 64-bit
        if (this.pos + 8 > this.buf.length) throw new Error('Unexpected end of protobuf data');
        this.pos += 8;
        break;
      case 2: { // length-delimited
        const len = this.readVarint32();
        if (this.pos + len > this.buf.length) throw new Error('Protobuf length-delimited field exceeds buffer bounds');
        this.pos += len;
        break;
      }
      case 5: // 32-bit
        if (this.pos + 4 > this.buf.length) throw new Error('Unexpected end of protobuf data');
        this.pos += 4;
        break;
      default:
        throw new Error(`Unknown wire type: ${wireType}`);
    }
  }
}
