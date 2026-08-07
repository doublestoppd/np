/**
 * Shared rotation banding: assignment, and the secret-keyed draw the word
 * puzzle and the lantern hunt both run on.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ROTATION_BANDS, bandForUser, keyedIndex } from "./bands";
import { addGameDays, type GameDate } from "./game-day";

const ANCHOR: GameDate = "2026-01-01";
const day = (n: number) => addGameDays(ANCHOR, n);
const POOL = 100;

describe("band assignment", () => {
  it("is stable for an account and inside the configured range", () => {
    for (const id of ["cuid_alpha", "cuid_beta", "cuid_gamma"]) {
      const band = bandForUser(id);
      expect(band).toBe(bandForUser(id));
      expect(Number.isInteger(band)).toBe(true);
      expect(band).toBeGreaterThanOrEqual(0);
      expect(band).toBeLessThan(ROTATION_BANDS);
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
    expect(counts.size).toBe(ROTATION_BANDS);
    const expected = 20_000 / ROTATION_BANDS;
    for (const [, n] of counts) {
      expect(n).toBeGreaterThan(expected * 0.7);
      expect(n).toBeLessThan(expected * 1.3);
    }
  });

  it("does not depend on the rotation secret", () => {
    // Which band you are in is observable from your own play; deriving it
    // from the real secret would put that secret behind a public value.
    const before = bandForUser("cuid_stable");
    process.env.DAILY_ROTATION_SECRET = "something-else-entirely";
    expect(bandForUser("cuid_stable")).toBe(before);
  });
});

describe("keyed index", () => {
  it("is deterministic and always inside the pool", () => {
    for (let band = 0; band < ROTATION_BANDS; band++) {
      const args = { purpose: "test", gameDate: day(5), band, count: POOL };
      const index = keyedIndex(args);
      expect(index).toBe(keyedIndex(args));
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(POOL);
    }
  });

  it("gives different bands different draws on the same day", () => {
    // The whole point: one leaked answer must not unlock the player base.
    const indexes = Array.from({ length: ROTATION_BANDS }, (_, band) =>
      keyedIndex({ purpose: "test", gameDate: day(11), band, count: POOL }),
    );
    // With 32 draws from 100 slots a few collisions are expected; a
    // *collapse* is the failure worth catching.
    expect(new Set(indexes).size).toBeGreaterThan(ROTATION_BANDS * 0.7);
  });

  it("moves a band's draw from day to day", () => {
    const indexes = Array.from({ length: 60 }, (_, d) =>
      keyedIndex({ purpose: "test", gameDate: day(d), band: 3, count: POOL }),
    );
    expect(new Set(indexes).size).toBeGreaterThan(30);
  });

  it("separates purposes and variants", () => {
    // Without domain separation a band's word would correlate with its
    // hiding place forever — learn one, learn the other.
    const base = { gameDate: day(9), band: 1, count: POOL };
    const word = keyedIndex({ ...base, purpose: "word", variant: "EASY" });
    const other = keyedIndex({ ...base, purpose: "word", variant: "HARD" });
    const lantern = keyedIndex({ ...base, purpose: "lantern" });
    expect(new Set([word, other, lantern]).size).toBeGreaterThan(1);
  });

  it("covers the pool roughly evenly over time", () => {
    // Guards the rejection sampling: a biased index would make some
    // options far more frequent, and frequency is a farming shortcut.
    const counts = new Array<number>(POOL).fill(0);
    for (let d = 0; d < 4000; d++) {
      counts[
        keyedIndex({ purpose: "test", gameDate: day(d), band: 0, count: POOL })
      ]! += 1;
    }
    expect(counts.every((n) => n > 0)).toBe(true);
    expect(Math.max(...counts)).toBeLessThan((4000 / POOL) * 2.5);
  });

  it("depends on the server secret, not on arithmetic", () => {
    // The property that makes this worth doing. If the mapping were pure
    // date arithmetic, an attacker who mapped the bands once could compute
    // every future day for free; because it is keyed, changing the key
    // changes the schedule.
    const draws = () =>
      Array.from({ length: 12 }, (_, d) =>
        keyedIndex({ purpose: "test", gameDate: day(d), band: 0, count: POOL }),
      );
    const before = draws();
    process.env.DAILY_ROTATION_SECRET = "a-different-secret-entirely";
    expect(draws()).not.toEqual(before);
  });

  it("rejects an empty pool and an out-of-range band", () => {
    const base = { purpose: "test", gameDate: ANCHOR };
    expect(() => keyedIndex({ ...base, band: 0, count: 0 })).toThrowError();
    expect(() =>
      keyedIndex({ ...base, band: ROTATION_BANDS, count: POOL }),
    ).toThrowError();
    expect(() => keyedIndex({ ...base, band: -1, count: POOL })).toThrowError();
  });

  afterEach(() => {
    delete process.env.DAILY_ROTATION_SECRET;
  });
});
