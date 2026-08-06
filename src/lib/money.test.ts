/** Unit tests for the shared money boundary (bigint everywhere). */
import { describe, expect, it } from "vitest";
import {
  MAX_MONEY_INPUT,
  coinLabel,
  coinsFromInput,
  coinsFromJSON,
  coinsToJSON,
  formatCoins,
} from "./money";

describe("coinsFromInput", () => {
  it("converts bounded integers to bigint", () => {
    expect(coinsFromInput(0)).toBe(0n);
    expect(coinsFromInput(1_234)).toBe(1_234n);
    expect(coinsFromInput(1_000_000_000)).toBe(MAX_MONEY_INPUT);
  });

  it("rejects negatives, fractions, and non-finite numbers", () => {
    expect(() => coinsFromInput(-1)).toThrowError();
    expect(() => coinsFromInput(1.5)).toThrowError();
    expect(() => coinsFromInput(Number.NaN)).toThrowError();
    expect(() => coinsFromInput(Number.POSITIVE_INFINITY)).toThrowError();
  });

  it("rejects values above the technical bound", () => {
    expect(() => coinsFromInput(1_000_000_001)).toThrowError(
      /maximum accepted value/,
    );
  });
});

describe("formatCoins", () => {
  it("groups digits for display", () => {
    expect(formatCoins(0n)).toBe("0");
    expect(formatCoins(999n)).toBe("999");
    expect(formatCoins(12_340n)).toBe("12,340");
  });

  it("is exact beyond Number.MAX_SAFE_INTEGER", () => {
    // 2^53 + 1 — the first integer Number cannot represent.
    expect(formatCoins(9_007_199_254_740_993n)).toBe("9,007,199,254,740,993");
  });
});

describe("coinLabel", () => {
  it("pluralizes correctly", () => {
    expect(coinLabel(1n)).toBe("coin");
    expect(coinLabel(0n)).toBe("coins");
    expect(coinLabel(2n)).toBe("coins");
  });
});

describe("coinsToJSON / coinsFromJSON", () => {
  it("round-trips exactly, including huge values", () => {
    for (const value of [0n, 1n, 200n, 9_007_199_254_740_993n]) {
      expect(coinsFromJSON(coinsToJSON(value))).toBe(value);
    }
  });

  it("accepts negative deltas (ledger semantics)", () => {
    expect(coinsFromJSON("-450")).toBe(-450n);
  });

  it("rejects anything that is not a plain decimal string", () => {
    for (const bad of ["12.5", "1e5", "abc", "", " 5", "0x10"]) {
      expect(() => coinsFromJSON(bad)).toThrowError(/Invalid serialized/);
    }
  });
});
