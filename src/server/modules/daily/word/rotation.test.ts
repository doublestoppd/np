/** Pure rotation math + authored content shape. */
import { describe, expect, it } from "vitest";
import { daysSinceRotationEpoch, rotationIndex } from "./rotation";
import { addGameDays } from "../game-day";
import { WORD_ROTATION_EPOCH, DIFFICULTY_CONFIG } from "./config";
import { wordAnswers } from "../../../../../prisma/content/daily/word-answers";

describe("rotation math", () => {
  it("day zero selects position 0", () => {
    expect(daysSinceRotationEpoch(WORD_ROTATION_EPOCH)).toBe(0);
    expect(rotationIndex(WORD_ROTATION_EPOCH, 100)).toBe(0);
  });

  it("advances one position per game day", () => {
    expect(rotationIndex(addGameDays(WORD_ROTATION_EPOCH, 1), 100)).toBe(1);
    expect(rotationIndex(addGameDays(WORD_ROTATION_EPOCH, 42), 100)).toBe(42);
    expect(rotationIndex(addGameDays(WORD_ROTATION_EPOCH, 99), 100)).toBe(99);
  });

  it("wraps after the final active answer", () => {
    expect(rotationIndex(addGameDays(WORD_ROTATION_EPOCH, 100), 100)).toBe(0);
    expect(rotationIndex(addGameDays(WORD_ROTATION_EPOCH, 101), 100)).toBe(1);
    expect(rotationIndex(addGameDays(WORD_ROTATION_EPOCH, 250), 100)).toBe(50);
  });

  it("stays valid for dates before the epoch", () => {
    expect(rotationIndex(addGameDays(WORD_ROTATION_EPOCH, -1), 100)).toBe(99);
    expect(rotationIndex(addGameDays(WORD_ROTATION_EPOCH, -100), 100)).toBe(0);
  });

  it("wraps to the list size, whatever it is", () => {
    expect(rotationIndex(addGameDays(WORD_ROTATION_EPOCH, 7), 3)).toBe(1);
    expect(rotationIndex(addGameDays(WORD_ROTATION_EPOCH, 3), 3)).toBe(0);
  });

  it("rejects an empty active list", () => {
    expect(() => rotationIndex(WORD_ROTATION_EPOCH, 0)).toThrowError();
  });
});

describe("authored answer lists", () => {
  it.each(["EASY", "MEDIUM", "HARD"] as const)(
    "%s has exactly 100 unique answers of the right length",
    (difficulty) => {
      const entries: ReadonlyArray<string | { word: string }> =
        wordAnswers[difficulty];
      expect(entries).toHaveLength(100);
      const words = entries.map((entry) =>
        typeof entry === "string" ? entry : entry.word,
      );
      expect(new Set(words).size).toBe(100);
      const { length } = DIFFICULTY_CONFIG[difficulty];
      for (const word of words) {
        expect(word).toMatch(/^[A-Z]+$/);
        expect(word).toHaveLength(length);
      }
      // Positions are the array indices: contiguous 0..99 by construction.
      expect(entries.length - 1).toBe(99);
    },
  );
});
