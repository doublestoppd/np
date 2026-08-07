/** The word game's use of the shared banding, and its authored content. */
import { describe, expect, it } from "vitest";
import { rotationIndex } from "./rotation";
import { addGameDays, type GameDate } from "../game-day";
import { ROTATION_BANDS } from "../bands";
import { DIFFICULTY_CONFIG } from "./config";
import { wordAnswers } from "../../../../../prisma/content/daily/word-answers";

const POOL = 100;
/** An arbitrary anchor: the rotation has no epoch, only dates. */
const ANCHOR: GameDate = "2026-01-01";
const day = (n: number) => addGameDays(ANCHOR, n);

describe("word rotation index", () => {
  it("is deterministic and always inside the pool", () => {
    for (let band = 0; band < ROTATION_BANDS; band++) {
      const index = rotationIndex(day(5), POOL, band, "EASY");
      expect(index).toBe(rotationIndex(day(5), POOL, band, "EASY"));
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(POOL);
    }
  });

  it("separates the three difficulties on the same day and band", () => {
    const easy = rotationIndex(day(9), POOL, 1, "EASY");
    const medium = rotationIndex(day(9), POOL, 1, "MEDIUM");
    const hard = rotationIndex(day(9), POOL, 1, "HARD");
    // Independent draws; identical values across all three would mean the
    // difficulty is not actually keyed in.
    expect(new Set([easy, medium, hard]).size).toBeGreaterThan(1);
  });

  it("rejects an empty pool and an out-of-range band", () => {
    expect(() => rotationIndex(ANCHOR, 0, 0, "EASY")).toThrowError();
    expect(() =>
      rotationIndex(ANCHOR, POOL, ROTATION_BANDS, "EASY"),
    ).toThrowError();
    expect(() => rotationIndex(ANCHOR, POOL, -1, "EASY")).toThrowError();
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

  it("has at least as many answers as there are bands", () => {
    // Fewer answers than bands would force bands to share a word, undoing
    // the separation they exist for.
    for (const difficulty of ["EASY", "MEDIUM", "HARD"] as const) {
      expect(wordAnswers[difficulty].length).toBeGreaterThanOrEqual(
        ROTATION_BANDS,
      );
    }
  });
});
