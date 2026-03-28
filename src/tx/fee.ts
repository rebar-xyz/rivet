import type { Coin } from '../proto/coin.js';

/**
 * Parse a gas price string (e.g., "0.025uatom") and calculate the fee
 * for a given gas limit. Amount is ceiling'd to ensure sufficient fee.
 */
export function calculateFee(gasLimit: bigint, gasPrice: string): { amount: Coin[]; gasLimit: bigint } {
  const { numerator, denominator, denom } = parseGasPrice(gasPrice);

  // ceiling division: (gasLimit * numerator + denominator - 1) / denominator
  const amount = denominator === 1n
    ? gasLimit * numerator
    : (gasLimit * numerator + denominator - 1n) / denominator;

  return {
    amount: [{ denom, amount: amount.toString() }],
    gasLimit,
  };
}

/** Apply a multiplier to gas estimation (ceiling). */
export function applyGasMultiplier(gasUsed: bigint, multiplier: number): bigint {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error(`Invalid gas multiplier: ${multiplier}. Must be a positive finite number.`);
  }
  const numerator = BigInt(Math.round(multiplier * 1e6));
  const denominator = BigInt(1e6);
  return (gasUsed * numerator + denominator - 1n) / denominator;
}

/**
 * Parse a gas price string into an exact rational (numerator/denominator)
 * and the denom suffix. Avoids floating-point by parsing the decimal
 * string directly into BigInt components.
 *
 * "0.025uatom"    → { numerator: 25n, denominator: 1000n, denom: "uatom" }
 * "500000000inj"  → { numerator: 500000000n, denominator: 1n, denom: "inj" }
 * "0.00000001u"   → { numerator: 1n, denominator: 100000000n, denom: "u" }
 */
function parseGasPrice(gasPrice: string): { numerator: bigint; denominator: bigint; denom: string } {
  const match = gasPrice.match(/^([0-9]*\.?[0-9]+)(.+)$/);
  if (!match) {
    throw new Error(`Invalid gas price format: "${gasPrice}". Expected format like "0.025uatom".`);
  }

  const priceStr = match[1]!;
  const denom = match[2]!;

  const dotIndex = priceStr.indexOf('.');
  if (dotIndex === -1) {
    // Integer price: "500000000" → 500000000n / 1n
    const numerator = BigInt(priceStr);
    return { numerator, denominator: 1n, denom };
  }

  // Decimal price: "0.025" → remove dot → "0025" = 25, denominator = 10^3
  const decimals = priceStr.length - dotIndex - 1;
  const withoutDot = priceStr.slice(0, dotIndex) + priceStr.slice(dotIndex + 1);
  const numerator = BigInt(withoutDot);
  const denominator = 10n ** BigInt(decimals);
  return { numerator, denominator, denom };
}
