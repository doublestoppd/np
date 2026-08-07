/** The pure matching rules: replay, legality, and the reward ladder. */
import { describe, expect, it } from "vitest";
import {
  MATCHING_CONFIG,
  MATCHING_DIFFICULTIES,
  replayFlips,
  rewardFor,
} from "./matching-rules";

// Two of each pair, laid out predictably so the expectations are readable.
const LAYOUT = [0, 1, 2, 0, 1, 2];

describe("replayFlips", () => {
  it("keeps a matched pair face up and clears a miss", () => {
    const matchThenMiss = replayFlips(LAYOUT, [0, 3, 1, 2]);
    expect(matchThenMiss.matched).toEqual([0, 3]);
    // The miss resolved: nothing is left showing that the player did not
    // just turn, which is what makes the game a memory game.
    expect(matchThenMiss.faceUp).toEqual([]);
    expect(matchThenMiss.pairsFound).toBe(1);
    expect(matchThenMiss.flipsUsed).toBe(4);
    expect(matchThenMiss.complete).toBe(false);
  });

  it("leaves one stone showing mid-turn", () => {
    const midTurn = replayFlips(LAYOUT, [0]);
    expect(midTurn.faceUp).toEqual([0]);
    expect(midTurn.matched).toEqual([]);
  });

  it("completes when every pair is found", () => {
    const done = replayFlips(LAYOUT, [0, 3, 1, 4, 2, 5]);
    expect(done.complete).toBe(true);
    expect(done.pairsFound).toBe(3);
    expect(done.flipsUsed).toBe(6);
  });

  it("refuses a card outside the board", () => {
    expect(replayFlips(LAYOUT, [6]).illegal).toBe(true);
    expect(replayFlips(LAYOUT, [-1]).illegal).toBe(true);
  });

  it("refuses turning the same stone twice in one turn", () => {
    // A legitimate client cannot do this, and allowing it would let a
    // player burn a flip to keep a card visible.
    expect(replayFlips(LAYOUT, [0, 0]).illegal).toBe(true);
  });

  it("refuses turning a stone that is already matched", () => {
    expect(replayFlips(LAYOUT, [0, 3, 0]).illegal).toBe(true);
  });

  it("is deterministic: the same log always replays the same board", () => {
    const flips = [0, 1, 2, 5, 0, 3];
    expect(replayFlips(LAYOUT, flips)).toEqual(replayFlips(LAYOUT, flips));
  });
});

describe("reward ladder", () => {
  it.each(MATCHING_DIFFICULTIES)("%s pays the bonus at or under par", (difficulty) => {
    const config = MATCHING_CONFIG[difficulty];
    expect(rewardFor(difficulty, config.par)).toBe(
      config.reward + config.parBonus,
    );
    expect(rewardFor(difficulty, config.par + 1)).toBe(config.reward);
    // Every finish pays something: the bonus is for insight, not the fee.
    expect(rewardFor(difficulty, config.flipBudget)).toBeGreaterThan(0n);
  });

  it("gets harder and pays more as the board grows", () => {
    const [gentle, brisk, deep] = MATCHING_DIFFICULTIES;
    expect(MATCHING_CONFIG[gentle!].pairs).toBeLessThan(
      MATCHING_CONFIG[brisk!].pairs,
    );
    expect(MATCHING_CONFIG[brisk!].pairs).toBeLessThan(
      MATCHING_CONFIG[deep!].pairs,
    );
    expect(MATCHING_CONFIG[gentle!].reward).toBeLessThan(
      MATCHING_CONFIG[brisk!].reward,
    );
    expect(MATCHING_CONFIG[brisk!].reward).toBeLessThan(
      MATCHING_CONFIG[deep!].reward,
    );
  });

  it("gives every board enough turns to be finishable by anyone", () => {
    // Perfect play needs pairs × 2. A budget near that would make the
    // gentle table a memory exam; these are deliberately generous.
    for (const difficulty of MATCHING_DIFFICULTIES) {
      const config = MATCHING_CONFIG[difficulty];
      expect(config.flipBudget).toBeGreaterThan(config.pairs * 3);
      expect(config.par).toBeGreaterThan(config.pairs * 2);
      expect(config.par).toBeLessThan(config.flipBudget);
      // The grid has to be rectangular, or the board renders ragged.
      expect((config.pairs * 2) % config.columns).toBe(0);
    }
  });
});
