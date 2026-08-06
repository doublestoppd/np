/**
 * The shared money boundary (docs/conventions.md). All monetary storage is
 * BIGINT; all monetary values in application code are `bigint`.
 *
 * Rules:
 * - Never convert an arbitrary bigint through `Number()` — display goes
 *   through formatCoins, JSON/idempotency payloads through coinsToJSON.
 * - Player input is bounded to MAX_MONEY_INPUT (1,000,000,000 coins) and a
 *   per-transaction total of MAX_TRANSACTION_TOTAL; these are technical
 *   safety bounds, not gameplay limits.
 */

export const MAX_MONEY_INPUT = 1_000_000_000n;
export const MAX_TRANSACTION_TOTAL = 2_000_000_000n;

const FORMATTER = new Intl.NumberFormat("en-US");

/** Converts validated numeric input (Zod-bounded ≤ 1e9) to coins. */
export function coinsFromInput(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid money input: ${value}`);
  }
  const coins = BigInt(value);
  if (coins > MAX_MONEY_INPUT) {
    throw new Error("Money input exceeds the maximum accepted value");
  }
  return coins;
}

/** Display formatting ("12,340"). Safe for any bigint. */
export function formatCoins(value: bigint): string {
  return FORMATTER.format(value);
}

/** "coin"/"coins" pluralization helper. */
export function coinLabel(value: bigint): string {
  return value === 1n ? "coin" : "coins";
}

/** JSON-safe serialization (decimal string) for stored results and logs. */
export function coinsToJSON(value: bigint): string {
  return value.toString();
}

/** Parses a decimal string previously produced by coinsToJSON. */
export function coinsFromJSON(value: string): bigint {
  if (!/^-?\d+$/.test(value)) {
    throw new Error("Invalid serialized money value");
  }
  return BigInt(value);
}
