/** Exhaustive duplicate-letter evaluation tests. */
import { describe, expect, it } from "vitest";
import {
  evaluateGuess,
  isNormalizedWord,
  isSolvedEvaluation,
  normalizeWord,
} from "./evaluate";

describe("evaluateGuess", () => {
  it("marks all exact matches", () => {
    expect(evaluateGuess("MOSS", "MOSS")).toBe("EEEE");
    expect(evaluateGuess("FOREST", "FOREST")).toBe("EEEEEE");
  });

  it("marks all absent letters", () => {
    expect(evaluateGuess("MOSS", "FERN")).toBe("AAAA");
  });

  it("mixes exact and present letters", () => {
    // Answer BRIAR / guess RIVER: final R exact; leading R and I present.
    expect(evaluateGuess("BRIAR", "RIVER")).toBe("PPAAE");
  });

  it("repeated letter in the guess, single in the answer", () => {
    // Answer GLOW has one L, at position 1 — only the exact copy scores.
    expect(evaluateGuess("GLOW", "LLLL")).toBe("AEAA");
  });

  it("repeated letter in the answer", () => {
    // Answer EMBERS (E at 0 and 3): both guessed E's in position are exact,
    // the third E in the guess finds no unmatched copy.
    expect(evaluateGuess("EMBERS", "ESTEEM")).toBe("EPAEAP");
  });

  it("more repeated letters in the guess than the answer", () => {
    // Answer SPARK has one S; the exact S consumes it, extra S's absent.
    expect(evaluateGuess("SPARK", "SASSY")).toBe("EPAAA");
  });

  it("an exact match consumes one repeated letter", () => {
    // Answer MOSS: the two exact S's consume both copies, so the leading
    // S of the guess cannot also be 'present'.
    expect(evaluateGuess("MOSS", "SASS")).toBe("AAEE");
    // One exact S + one extra S with only one unmatched copy remaining.
    expect(evaluateGuess("MOSS", "SOSA")).toBe("PEEA");
  });

  it("present letters are capped by unmatched copies", () => {
    // Answer STONE / guess NOONS: O (pos 2) and N (pos 3) are exact and
    // consume the only O and N — the other guessed N and O score absent;
    // the final S is present.
    expect(evaluateGuess("STONE", "NOONS")).toBe("AAEEP");
  });

  it("rejects length mismatches", () => {
    expect(() => evaluateGuess("MOSS", "BRIAR")).toThrowError();
  });
});

describe("normalization", () => {
  it("normalizes case, whitespace, and compatibility forms", () => {
    expect(normalizeWord("  moss ")).toBe("MOSS");
    expect(normalizeWord("Ｍｏｓｓ")).toBe("MOSS");
  });

  it("accepts only uppercase ASCII words", () => {
    expect(isNormalizedWord("MOSS")).toBe(true);
    expect(isNormalizedWord("CAFÉ")).toBe(false);
    expect(isNormalizedWord("MO SS")).toBe(false);
    expect(isNormalizedWord("MOSS4")).toBe(false);
    expect(isNormalizedWord("IT'S")).toBe(false);
    expect(isNormalizedWord("RE-DO")).toBe(false);
  });

  it("detects solved evaluations", () => {
    expect(isSolvedEvaluation("EEEE")).toBe(true);
    expect(isSolvedEvaluation("EEPE")).toBe(false);
    expect(isSolvedEvaluation("")).toBe(false);
  });
});
