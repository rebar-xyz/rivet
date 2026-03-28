import {
  BroadcastError,
  InsufficientFundsError,
  SequenceMismatchError,
  OutOfGasError,
  UnauthorizedError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Log parsers
// ---------------------------------------------------------------------------

/**
 * Extract expected and actual sequence numbers from a chain error log.
 * Matches patterns like: "account sequence mismatch, expected 5, got 3"
 */
export function parseSequenceMismatch(log: string): { expected: bigint; actual: bigint } | null {
  const match = log.match(/expected\s+(\d+),?\s+got\s+(\d+)/i);
  if (!match) return null;
  return { expected: BigInt(match[1]!), actual: BigInt(match[2]!) };
}

/**
 * Extract gasUsed and gasWanted from a chain out-of-gas error log.
 * Matches patterns like: "out of gas in location ...; gasWanted: 200000, gasUsed: 250000"
 */
export function parseOutOfGas(log: string): { gasWanted: bigint; gasUsed: bigint } | null {
  const match = log.match(/gasWanted:\s*(\d+).*?gasUsed:\s*(\d+)/i);
  if (match) {
    return { gasWanted: BigInt(match[1]!), gasUsed: BigInt(match[2]!) };
  }
  // Alternative format: "out of gas: gasUsed=250000 gasWanted=200000"
  const alt = log.match(/gasUsed[=:]\s*(\d+).*?gasWanted[=:]\s*(\d+)/i);
  if (alt) {
    return { gasUsed: BigInt(alt[1]!), gasWanted: BigInt(alt[2]!) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classify a broadcast error by its code and raw log into a specific error subtype.
 *
 * Code mapping (Cosmos SDK):
 * - 4: Unauthorized
 * - 5: Insufficient funds
 * - 11: Out of gas
 * - 32: Sequence mismatch (wrong sequence)
 */
export function classifyBroadcastError(
  code: number,
  rawLog: string,
  txHash?: string,
): BroadcastError {
  switch (code) {
    case 32: {
      const parsed = parseSequenceMismatch(rawLog);
      return new SequenceMismatchError(
        rawLog,
        parsed?.expected ?? 0n,
        parsed?.actual ?? 0n,
        txHash,
      );
    }

    case 11: {
      const parsed = parseOutOfGas(rawLog);
      return new OutOfGasError(
        rawLog,
        parsed?.gasUsed ?? 0n,
        parsed?.gasWanted ?? 0n,
        txHash,
      );
    }

    case 4:
      return new UnauthorizedError(rawLog, txHash);

    case 5:
      return new InsufficientFundsError(rawLog, txHash);

    default: {
      // Regex fallback: some chains report insufficient funds with non-standard codes
      if (/insufficient funds/i.test(rawLog)) {
        return new InsufficientFundsError(rawLog, txHash);
      }

      return new BroadcastError(
        `Transaction failed (code ${code}): ${rawLog}`,
        code,
        rawLog,
        txHash,
      );
    }
  }
}
