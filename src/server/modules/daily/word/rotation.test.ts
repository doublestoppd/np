/** Per-band keyed rotation + authored content shape. */
import { afterEach, describe, expect, it } from "vitest";
import { bandForUser, rotationIndex } from "./rotation";
import { addGameDays, type GameDate } from "../game-day";
import { WORD_BANDS, DIFFICULTY_CONFIG } from "./config";
import { wordAnswers } from "../../../../../prisma/content/daily/word-answers";

const POOL = 100;
/** An arbitrary anchor: the rotation has no epoch, only dates. */
const ANCHOR: GameDate = "2026-01-01";
const day = (n: number) => addGameDays(ANCHOR, n);

describe("band assignment", () => {
  it("is stable for an account and inside the configured range", () => {
    for (const id of ["cuid_alpha", "cuid_beta", "cuid_gamma"]) {
      const band = bandForUser(id);
      expect(band).toBe(bandForUser(id));
      expect(Number.isInteger(band)).toBe(true);
      expect(band).toBeGreaterThanOrEqual(0);
      expect(band).toBeLessThan(WORD_BANDS);
    }
  });

  it("spreads accounts across every band", () => {
    // A skewed assignment would quietly shrink the effective band count,
    // which is exactly the anti-farming factor.
    const counts = new Map<number, number>();
    for (let i = 0; i < 20_000; i++) {
      const band = bandForUser(`user_${i}`);
      counts.set(band, (counts.get(band) ?? 0) + 1);
    }
    expect(counts.size).toBe(WORD_BANDS);
    const expected = 20_000 / WORD_BANDS;
    for (const [, n] of counts) {
      expect(n).toBeGreaterThan(expected * 0.7);
      expect(n).toBeLessThan(expected * 1.3);
    }
  });
});

describe("keyed rotation index", () => {
  it("is deterministic and always inside the pool", () => {
    for (let band = 0; band < WORD_BANDS; band++) {
      const index = rotationIndex(day(5), POOL, band, "EASY");
      expect(index).toBe(rotationIndex(day(5), POOL, band, "EASY"));
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(POOL);
    }
  });

  it("gives different bands different answers on the same day", () => {
    // The whole point: one leaked answer must not unlock the player base.
    const indexes = Array.from({ length: WORD_BANDS }, (_, band) =>
      rotationIndex(day(11), POOL, band, "HARD"),
    );
    // With 32 draws from 100 slots a few collisions are expected; a
    // *collapse* is the failure worth catching.
    expect(new Set(indexes).size).toBeGreaterThan(WORD_BANDS * 0.7);
  });

  it("moves a band's answer from day to day", () => {
    const indexes = Array.from({ length: 60 }, (_, d) =>
      rotationIndex(day(d), POOL, 3, "MEDIUM"),
    );
    expect(new Set(indexes).size).toBeGreaterThan(30);
  });

  it("separates the three difficulties on the same day and band", () => {
    const easy = rotationIndex(day(9), POOL, 1, "EASY");
    const medium = rotationIndex(day(9), POOL, 1, "MEDIUM");
    const hard = rotationIndex(day(9), POOL, 1, "HARD");
    // Independent draws; identical values across all three would mean the
    // difficulty is not actually keyed in.
    expect(new Set([easy, medium, hard]).size).toBeGreaterThan(1);
  });

  it("covers the pool roughly evenly over time", () => {
    // Guards the rejection sampling: a biased index would make some
    // answers far more frequent, and frequency is a farming shortcut.
    const counts = new Array<number>(POOL).fill(0);
    for (let d = 0; d < 4000; d++) {
      counts[rotationIndex(day(d), POOL, 0, "EASY")]! += 1;
    }
    expect(counts.every((n) => n > 0)).toBe(true);
    const expected = 4000 / POOL;
    expect(Math.max(...counts)).toBeLessThan(expected * 2.5);
  });

  it("depends on the server secret, not on arithmetic", () => {
    // The property that makes this worth doing. If the mapping were pure
    // date arithmetic, an attacker who mapped the bands once could compute
    // every future day for free; because it is keyed, changing the key
    // changes the schedule.
    const before = Array.from({ length: 12 }, (_, d) =>
      rotationIndex(day(d), POOL, 0, "EASY"),
    );
    process.env.WORD_ROTATION_SECRET = "a-different-secret-entirely";
    const after = Array.from({ length: 12 }, (_, d) =>
      rotationIndex(day(d), POOL, 0, "EASY"),
    );
    expect(after).not.toEqual(before);
  });

  afterEach(() => {
    delete process.env.WORD_ROTATION_SECRET;
  });

  it("rejects an empty pool and an out-of-range band", () => {
    expect(() => rotationIndex(ANCHOR, 0, 0, "EASY")).toThrowError();
    expect(() =>
      rotationIndex(ANCHOR, POOL, WORD_BANDS, "EASY"),
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
      expect(wordAnswers[difficulty].length).toBeGreaterThanOrEqual(WORD_BANDS);
    }
  });
});
