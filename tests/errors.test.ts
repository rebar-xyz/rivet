import { describe, it, expect } from 'vitest';
import {
  RivetError,
  BroadcastError,
  InsufficientFundsError,
  SequenceMismatchError,
  OutOfGasError,
  UnauthorizedError,
  TimeoutError,
} from '../src/errors.js';
import {
  classifyBroadcastError,
  parseSequenceMismatch,
  parseOutOfGas,
} from '../src/error-classify.js';

// ---------------------------------------------------------------------------
// Error class properties
// ---------------------------------------------------------------------------

describe('error classes', () => {
  it('SequenceMismatchError has correct name, code, txCode', () => {
    const err = new SequenceMismatchError('expected 5, got 3', 5n, 3n, 'ABC123');
    expect(err.name).toBe('SequenceMismatchError');
    expect(err.code).toBe('SEQUENCE_MISMATCH');
    expect(err.txCode).toBe(32);
    expect(err.expected).toBe(5n);
    expect(err.actual).toBe(3n);
    expect(err.txHash).toBe('ABC123');
  });

  it('OutOfGasError has correct name, code, txCode', () => {
    const err = new OutOfGasError('out of gas', 250000n, 200000n, 'DEF456');
    expect(err.name).toBe('OutOfGasError');
    expect(err.code).toBe('OUT_OF_GAS');
    expect(err.txCode).toBe(11);
    expect(err.gasUsed).toBe(250000n);
    expect(err.gasWanted).toBe(200000n);
  });

  it('UnauthorizedError has correct name, code, txCode', () => {
    const err = new UnauthorizedError('not authorized', 'GHI789');
    expect(err.name).toBe('UnauthorizedError');
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.txCode).toBe(4);
  });

  it('TimeoutError has correct name, code, timeoutMs', () => {
    const err = new TimeoutError(60000, 'JKL012');
    expect(err.name).toBe('TimeoutError');
    expect(err.code).toBe('TIMEOUT');
    expect(err.txCode).toBe(-1);
    expect(err.timeoutMs).toBe(60000);
    expect(err.txHash).toBe('JKL012');
  });

});

// ---------------------------------------------------------------------------
// instanceof hierarchy
// ---------------------------------------------------------------------------

describe('instanceof hierarchy', () => {
  it('SequenceMismatchError is BroadcastError and RivetError', () => {
    const err = new SequenceMismatchError('log', 5n, 3n);
    expect(err).toBeInstanceOf(SequenceMismatchError);
    expect(err).toBeInstanceOf(BroadcastError);
    expect(err).toBeInstanceOf(RivetError);
    expect(err).toBeInstanceOf(Error);
  });

  it('OutOfGasError is BroadcastError and RivetError', () => {
    const err = new OutOfGasError('log', 250000n, 200000n);
    expect(err).toBeInstanceOf(OutOfGasError);
    expect(err).toBeInstanceOf(BroadcastError);
    expect(err).toBeInstanceOf(RivetError);
  });

  it('UnauthorizedError is BroadcastError and RivetError', () => {
    const err = new UnauthorizedError('log');
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err).toBeInstanceOf(BroadcastError);
    expect(err).toBeInstanceOf(RivetError);
  });

  it('TimeoutError is BroadcastError and RivetError', () => {
    const err = new TimeoutError(60000);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(err).toBeInstanceOf(BroadcastError);
    expect(err).toBeInstanceOf(RivetError);
  });

  it('InsufficientFundsError is still BroadcastError', () => {
    const err = new InsufficientFundsError('not enough');
    expect(err).toBeInstanceOf(InsufficientFundsError);
    expect(err).toBeInstanceOf(BroadcastError);
    expect(err).toBeInstanceOf(RivetError);
  });
});

// ---------------------------------------------------------------------------
// Log parsers
// ---------------------------------------------------------------------------

describe('parseSequenceMismatch', () => {
  it('parses standard Cosmos SDK format', () => {
    const log = 'account sequence mismatch, expected 5, got 3: incorrect account sequence';
    const result = parseSequenceMismatch(log);
    expect(result).toEqual({ expected: 5n, actual: 3n });
  });

  it('parses without comma', () => {
    const log = 'expected 100 got 98';
    const result = parseSequenceMismatch(log);
    expect(result).toEqual({ expected: 100n, actual: 98n });
  });

  it('returns null for non-matching log', () => {
    expect(parseSequenceMismatch('some other error')).toBeNull();
  });
});

describe('parseOutOfGas', () => {
  it('parses standard Cosmos SDK format', () => {
    const log = 'out of gas in location: ReadFlat; gasWanted: 200000, gasUsed: 250000';
    const result = parseOutOfGas(log);
    expect(result).toEqual({ gasWanted: 200000n, gasUsed: 250000n });
  });

  it('parses alternative format', () => {
    const log = 'out of gas: gasUsed=250000 gasWanted=200000';
    const result = parseOutOfGas(log);
    expect(result).toEqual({ gasUsed: 250000n, gasWanted: 200000n });
  });

  it('returns null for non-matching log', () => {
    expect(parseOutOfGas('some other error')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyBroadcastError
// ---------------------------------------------------------------------------

describe('classifyBroadcastError', () => {
  it('code 32 → SequenceMismatchError', () => {
    const err = classifyBroadcastError(32, 'expected 5, got 3', 'HASH');
    expect(err).toBeInstanceOf(SequenceMismatchError);
    const seq = err as SequenceMismatchError;
    expect(seq.expected).toBe(5n);
    expect(seq.actual).toBe(3n);
    expect(seq.txHash).toBe('HASH');
  });

  it('code 11 → OutOfGasError', () => {
    const err = classifyBroadcastError(11, 'gasWanted: 200000, gasUsed: 250000');
    expect(err).toBeInstanceOf(OutOfGasError);
    const oog = err as OutOfGasError;
    expect(oog.gasWanted).toBe(200000n);
    expect(oog.gasUsed).toBe(250000n);
  });

  it('code 4 → UnauthorizedError', () => {
    const err = classifyBroadcastError(4, 'unauthorized');
    expect(err).toBeInstanceOf(UnauthorizedError);
  });

  it('code 5 → InsufficientFundsError', () => {
    const err = classifyBroadcastError(5, 'insufficient funds');
    expect(err).toBeInstanceOf(InsufficientFundsError);
  });

  it('unknown code with "insufficient funds" in log → InsufficientFundsError', () => {
    const err = classifyBroadcastError(99, 'insufficient funds to pay for fees');
    expect(err).toBeInstanceOf(InsufficientFundsError);
  });

  it('unknown code with generic log → BroadcastError', () => {
    const err = classifyBroadcastError(7, 'something went wrong');
    expect(err).toBeInstanceOf(BroadcastError);
    expect(err).not.toBeInstanceOf(InsufficientFundsError);
    expect(err.txCode).toBe(7);
  });

  it('code 32 without parseable sequence still returns SequenceMismatchError', () => {
    const err = classifyBroadcastError(32, 'wrong sequence');
    expect(err).toBeInstanceOf(SequenceMismatchError);
    const seq = err as SequenceMismatchError;
    expect(seq.expected).toBe(0n);
    expect(seq.actual).toBe(0n);
  });
});
