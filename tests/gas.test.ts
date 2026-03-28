import { describe, it, expect } from 'vitest';
import { calculateFee, applyGasMultiplier } from '../src/tx/fee';

describe('Fee calculation', () => {
  it('calculates fee from gas price string', () => {
    const fee = calculateFee(200000n, '0.025urebar');
    expect(fee.gasLimit).toBe(200000n);
    expect(fee.amount.length).toBe(1);
    expect(fee.amount[0]!.denom).toBe('urebar');
    // 200000 * 0.025 = 5000
    expect(fee.amount[0]!.amount).toBe('5000');
  });

  it('uses ceiling for non-integer results', () => {
    const fee = calculateFee(100001n, '0.025urebar');
    // 100001 * 0.025 = 2500.025 → ceiling = 2501
    expect(fee.amount[0]!.amount).toBe('2501');
  });

  it('handles whole number gas price', () => {
    const fee = calculateFee(100000n, '1urebar');
    expect(fee.amount[0]!.amount).toBe('100000');
  });

  it('throws on invalid gas price format', () => {
    expect(() => calculateFee(100000n, 'invalid')).toThrow('Invalid gas price');
  });
});

describe('Gas multiplier', () => {
  it('applies multiplier with ceiling', () => {
    const result = applyGasMultiplier(100000n, 1.75);
    // 100000 * 1.75 = 175000
    expect(result).toBe(175000n);
  });

  it('ceiling rounds up fractional results', () => {
    const result = applyGasMultiplier(100001n, 1.5);
    // 100001 * 1.5 = 150001.5 → ceiling = 150002
    expect(result).toBe(150002n);
  });

  it('multiplier of 1.0 returns same value', () => {
    const result = applyGasMultiplier(50000n, 1.0);
    expect(result).toBe(50000n);
  });

  it('rejects NaN multiplier', () => {
    expect(() => applyGasMultiplier(100000n, NaN)).toThrow('Invalid gas multiplier');
  });

  it('rejects Infinity multiplier', () => {
    expect(() => applyGasMultiplier(100000n, Infinity)).toThrow('Invalid gas multiplier');
  });

  it('rejects negative multiplier', () => {
    expect(() => applyGasMultiplier(100000n, -1)).toThrow('Invalid gas multiplier');
  });

  it('rejects zero multiplier', () => {
    expect(() => applyGasMultiplier(100000n, 0)).toThrow('Invalid gas multiplier');
  });
});

// ─── Cross-Chain Fee Scenarios ──────────────────────────────────────────────

describe('Fee calculation — cross-chain scenarios', () => {
  it('very small gas price (8 decimal places)', () => {
    // Some chains use extremely small gas prices
    const fee = calculateFee(200000n, '0.00000001uatom');
    expect(fee.amount[0]!.denom).toBe('uatom');
    // 200000 * 0.00000001 = 0.002 → ceiling = 1
    expect(BigInt(fee.amount[0]!.amount)).toBeGreaterThanOrEqual(1n);
  });

  it('very large gas price (Injective-style)', () => {
    const fee = calculateFee(200000n, '500000000inj');
    expect(fee.amount[0]!.denom).toBe('inj');
    // 200000 * 500000000 = 100_000_000_000_000 — exact with BigInt parsing
    expect(fee.amount[0]!.amount).toBe('100000000000000');
  });

  it('very large gas limit (complex CosmWasm tx)', () => {
    const fee = calculateFee(50_000_000n, '0.025uosmo');
    // 50_000_000 * 0.025 = 1_250_000
    expect(fee.amount[0]!.amount).toBe('1250000');
  });

  it('zero gas price (some testnets allow free txs)', () => {
    const fee = calculateFee(200000n, '0uatom');
    expect(fee.amount[0]!.amount).toBe('0');
    expect(fee.amount[0]!.denom).toBe('uatom');
  });

  it('factory denom with slashes', () => {
    const fee = calculateFee(200000n, '0.01factory/osmo1abc/uLP');
    expect(fee.amount[0]!.denom).toBe('factory/osmo1abc/uLP');
    // 200000 * 0.01 = 2000
    expect(fee.amount[0]!.amount).toBe('2000');
  });

  it('ibc denom with hash', () => {
    const fee = calculateFee(150000n, '0.025ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2');
    expect(fee.amount[0]!.denom).toBe('ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2');
    // 150000 * 0.025 = 3750
    expect(fee.amount[0]!.amount).toBe('3750');
  });

  it('precision boundary: no floating-point drift at 18 decimal precision', () => {
    // This is the edge case that breaks naive `Number(gasLimit) * price`:
    // JS float can't represent 0.025 * 100001 exactly (2500.025)
    // Our BigInt-based approach must ceil correctly
    const fee = calculateFee(100001n, '0.025uatom');
    expect(fee.amount[0]!.amount).toBe('2501');

    // Another precision case
    const fee2 = calculateFee(333333n, '0.003ustars');
    // 333333 * 0.003 = 999.999 → ceiling = 1000
    expect(fee2.amount[0]!.amount).toBe('1000');
  });

  it('large gas limit with small price preserves precision', () => {
    // 10_000_000_000 * 0.000025 = 250000
    const fee = calculateFee(10_000_000_000n, '0.000025utiny');
    expect(fee.amount[0]!.amount).toBe('250000');
  });

  it('exact results for prices that would drift under float arithmetic', () => {
    // These are cases where `parseFloat(price) * 1e18` exceeds float53
    // precision. The rational BigInt parser must produce exact answers.

    // 15-digit integer price: float would lose low-order digits
    const fee1 = calculateFee(1n, '999999999999999utoken');
    expect(fee1.amount[0]!.amount).toBe('999999999999999');

    // Decimal whose numerator exceeds float53 when scaled
    // "123456789.123456" → numerator 123456789123456, denominator 1000000
    // 2 * 123456789123456 / 1000000 = 246913578.246912 → ceiling = 246913579
    const fee2 = calculateFee(2n, '123456789.123456utoken');
    expect(fee2.amount[0]!.amount).toBe('246913579');

    // Verify the inverse: exact multiple should NOT ceiling
    // 1000000 * 123456789.123456 = 123456789123456 (exact)
    const fee3 = calculateFee(1_000_000n, '123456789.123456utoken');
    expect(fee3.amount[0]!.amount).toBe('123456789123456');
  });
});

describe('Fee calculation — fuzz', () => {
  /**
   * Verify the ceiling property: for any gas limit and price string,
   * the computed fee must be the exact mathematical ceiling of
   * gasLimit * price. We check this by reconstructing the rational
   * from the price string and asserting two invariants:
   *
   *   1. amount * denom >= gasLimit * numer   (never underpays)
   *   2. (amount - 1) * denom < gasLimit * numer   (tight ceiling)
   *
   * Invariant 2 is skipped when amount is 0 (zero price).
   */
  function assertCeilingProperty(gasLimit: bigint, priceStr: string, denom: string) {
    const fee = calculateFee(gasLimit, `${priceStr}${denom}`);
    const amount = BigInt(fee.amount[0]!.amount);

    // Reconstruct the exact rational from the price string
    const dotIdx = priceStr.indexOf('.');
    let numer: bigint;
    let denominator: bigint;
    if (dotIdx === -1) {
      numer = BigInt(priceStr);
      denominator = 1n;
    } else {
      const decimals = priceStr.length - dotIdx - 1;
      numer = BigInt(priceStr.slice(0, dotIdx) + priceStr.slice(dotIdx + 1));
      denominator = 10n ** BigInt(decimals);
    }

    // Exact product: gasLimit * numer (compare against amount * denominator)
    const exactProduct = gasLimit * numer;

    // Invariant 1: never underpays
    expect(amount * denominator).toBeGreaterThanOrEqual(exactProduct);

    // Invariant 2: tight ceiling (overpays by less than 1 unit)
    if (amount > 0n) {
      expect((amount - 1n) * denominator).toBeLessThan(exactProduct);
    }
  }

  it('fuzz: 200 random gas limit + decimal price combinations', () => {
    for (let i = 0; i < 200; i++) {
      // Random gas limit: 1 to 10 billion
      const gasLimit = BigInt(1 + Math.floor(Math.random() * 10_000_000_000));

      // Random decimal price with 1-8 decimal places
      const intPart = Math.floor(Math.random() * 1000);
      const decimals = 1 + Math.floor(Math.random() * 8);
      const fracPart = String(Math.floor(Math.random() * 10 ** decimals)).padStart(decimals, '0');
      const priceStr = `${intPart}.${fracPart}`;

      assertCeilingProperty(gasLimit, priceStr, 'ufuzz');
    }
  });

  it('fuzz: 50 random gas limit + integer price combinations', () => {
    for (let i = 0; i < 50; i++) {
      const gasLimit = BigInt(1 + Math.floor(Math.random() * 10_000_000_000));
      const price = Math.floor(Math.random() * 1_000_000_000);
      const priceStr = String(price);

      assertCeilingProperty(gasLimit, priceStr, 'ufuzz');
    }
  });
});

describe('Gas multiplier — edge cases', () => {
  it('very large gas used with multiplier stays in BigInt range', () => {
    // Simulate a chain with very high gas (e.g., EVM-compatible)
    const result = applyGasMultiplier(30_000_000n, 1.3);
    // 30_000_000 * 1.3 = 39_000_000
    expect(result).toBe(39_000_000n);
  });

  it('fractional multiplier on odd gas value (ceiling test)', () => {
    // 7n * 1.5 = 10.5 → ceiling = 11
    const result = applyGasMultiplier(7n, 1.5);
    expect(result).toBe(11n);
  });

  it('multiplier very close to 1.0', () => {
    const result = applyGasMultiplier(100000n, 1.001);
    // 100000 * 1.001 = 100100
    expect(result).toBe(100100n);
  });

  it('large multiplier (3x safety margin)', () => {
    const result = applyGasMultiplier(100000n, 3.0);
    expect(result).toBe(300000n);
  });
});
