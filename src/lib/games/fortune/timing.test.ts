import { describe, expect, it } from "vitest";
import { REELS } from "./reels";
import {
  FIRST_LAND_MS,
  landingMs,
  lastLandingMs,
  LOOP_FACES,
  reelTiming,
  SETTLE_MS,
} from "./timing";

/**
 * The drums' timing.
 *
 * Worth pinning rather than leaving as three constants in a component,
 * because these are the numbers somebody asked for in seconds and they are
 * easy to break by tuning one and not the others — the loop has to stay
 * fast while the whole spin gets longer, and the settle has to stay short
 * enough to still read as a stop rather than a slow drift.
 */

describe("when each drum lands", () => {
  it("turns for several seconds before the first one slows", () => {
    expect(FIRST_LAND_MS).toBeGreaterThanOrEqual(4_500);
  });

  it("lands them two to three seconds apart", () => {
    for (let reel = 1; reel < REELS; reel += 1) {
      const gap = landingMs(reel) - landingMs(reel - 1);
      expect(gap, `drum ${reel}`).toBeGreaterThanOrEqual(2_000);
      expect(gap, `drum ${reel}`).toBeLessThanOrEqual(3_000);
    }
  });

  it("lands them in order, left to right", () => {
    for (let reel = 1; reel < REELS; reel += 1) {
      expect(landingMs(reel)).toBeGreaterThan(landingMs(reel - 1));
    }
    expect(lastLandingMs(REELS)).toBe(landingMs(REELS - 1));
  });
});

describe("the two phases of one drum", () => {
  it("spends nearly all of the spin at a constant speed", () => {
    // The settle is a run-in, not the spin. If it grew to a large share of
    // the time the reel would be visibly slowing for most of its travel,
    // which is the exact look this timing exists to avoid.
    for (let reel = 0; reel < REELS; reel += 1) {
      const { spinMs, settleMs } = reelTiming(reel);
      expect(settleMs / (spinMs + settleMs), `drum ${reel}`).toBeLessThan(0.2);
    }
  });

  it("fits a whole number of loop turns into the spin, exactly", () => {
    // A fractional turn leaves the strip part-way through a cycle, and the
    // settle — which starts from the seam — would jump it back first.
    for (let reel = 0; reel < REELS; reel += 1) {
      const { loops, loopMs, spinMs } = reelTiming(reel);
      expect(Number.isInteger(loops), `drum ${reel}`).toBe(true);
      expect(loops).toBeGreaterThanOrEqual(1);
      expect(loopMs * loops, `drum ${reel}`).toBeCloseTo(spinMs, 6);
    }
  });

  it("keeps the loop turning fast whatever the spin length", () => {
    // Eight faces per turn, so this is the speed the player reads as "a
    // drum spinning". A longer spin must add turns, never slow them down.
    for (let reel = 0; reel < REELS; reel += 1) {
      const { loopMs } = reelTiming(reel);
      const facesPerSecond = (LOOP_FACES / loopMs) * 1_000;
      expect(facesPerSecond, `drum ${reel}`).toBeGreaterThan(12);
    }
  });

  it("ends each drum's settle exactly when it is due to land", () => {
    for (let reel = 0; reel < REELS; reel += 1) {
      const { spinMs, settleMs } = reelTiming(reel);
      expect(spinMs + settleMs).toBe(landingMs(reel));
      expect(settleMs).toBe(SETTLE_MS);
    }
  });
});
