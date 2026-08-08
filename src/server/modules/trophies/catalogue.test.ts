import { describe, expect, it } from "vitest";
import { TROPHIES, TROPHY_GROUP_NAMES, trophyFor } from "./catalogue";
import type { TrophyFacts } from "./facts";

/**
 * The trophy catalogue (ADR-65).
 *
 * Every predicate is pure over a facts snapshot, so all of this runs
 * without a database — which is the point of the split. What is worth
 * pinning here is not each individual threshold (those are a design call
 * and will move) but the properties that make the catalogue safe to edit:
 * keys are unique and stable-looking, nothing is earned by a brand new
 * player, everything is reachable, and each trophy responds to exactly the
 * fact it claims to.
 */

const NOTHING: TrophyFacts = {
  wordSolved: 0,
  wordSolvedSharp: 0,
  wheelSpins: 0,
  mealsClaimed: 0,
  drinksClaimed: 0,
  lanternsFound: 0,
  forageFinds: 0,
  fishKinds: 0,
  sudokuSolved: 0,
  sudokuSolvedClean: 0,
  matchingDeepCompleted: 0,
  sortingCompleted: 0,
  caveCleared: 0,
  scratchWins: 0,
  slotWins: 0,
  bestPaperBird: 0,
  bestTreeClimb: 0,
  bestSnake: 0,
  requestsCompleted: 0,
  shopSales: 0,
  npcPurchases: 0,
  giveawaysLeft: 0,
  bestBond: 0,
  ailmentsTreated: 0,
  booksRead: 0,
  delightsFound: 0,
  hollowPlacements: 0,
};

/** Every fact turned up implausibly high. */
const EVERYTHING: TrophyFacts = Object.fromEntries(
  Object.keys(NOTHING).map((key) => [key, 100_000]),
) as unknown as TrophyFacts;

describe("the trophy catalogue", () => {
  it("has unique keys", () => {
    // The key is what a PlayerTrophy row stores, so a duplicate would make
    // two trophies indistinguishable in the database.
    const keys = TROPHIES.map((trophy) => trophy.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names a known group for every trophy", () => {
    for (const trophy of TROPHIES) {
      expect(TROPHY_GROUP_NAMES[trophy.group], trophy.key).toBeTruthy();
    }
  });

  it("says what it takes, in a sentence", () => {
    // The criteria line is shown to the player on every trophy, earned or
    // not. An empty one would render a locked trophy that will not say
    // what it wants.
    for (const trophy of TROPHIES) {
      expect(trophy.criteria.length, trophy.key).toBeGreaterThan(15);
      expect(trophy.criteria.endsWith("."), trophy.key).toBe(true);
      expect(trophy.name.length, trophy.key).toBeGreaterThan(2);
      expect(trophy.icon.length, trophy.key).toBeGreaterThan(0);
    }
  });

  it("gives a brand new player nothing at all", () => {
    // A trophy earned by signing up is not a trophy. This also catches the
    // `>= 0` typo, which would award silently and for ever.
    const earned = TROPHIES.filter((trophy) => trophy.earned(NOTHING));
    expect(earned.map((trophy) => trophy.key)).toEqual([]);
  });

  it("is entirely reachable", () => {
    // The other half: a threshold nobody can cross is worse than no
    // trophy, because it advertises itself on every profile for ever.
    const unreachable = TROPHIES.filter((trophy) => !trophy.earned(EVERYTHING));
    expect(unreachable.map((trophy) => trophy.key)).toEqual([]);
  });

  it("makes each trophy depend on at least one fact, and not on all of them", () => {
    // Two failures in one: a predicate that ignores its facts (always
    // true, or always false), and a copy-paste that leaves a trophy
    // reading the field belonging to the one above it. Raising exactly one
    // fact at a time must turn on at least one trophy per fact used, and
    // must never turn on everything.
    for (const trophy of TROPHIES) {
      const sensitive = (Object.keys(NOTHING) as (keyof TrophyFacts)[]).filter(
        (fact) => trophy.earned({ ...NOTHING, [fact]: 100_000 }),
      );
      expect(sensitive.length, `${trophy.key} reads no fact`).toBeGreaterThan(
        0,
      );
      expect(
        sensitive.length,
        `${trophy.key} is earned by unrelated facts`,
      ).toBeLessThanOrEqual(2);
    }
  });

  it("covers every activity in the game", () => {
    // The brief was a trophy for every activity. This is the list, and it
    // is here so that adding an activity without a trophy is a test
    // failure rather than an omission nobody notices.
    const groups = new Set(TROPHIES.map((trophy) => trophy.group));
    expect([...groups].sort()).toEqual([
      "arcade",
      "community",
      "companions",
      "daily",
      "gathering",
      "nerve",
      "puzzles",
    ]);
    for (const key of [
      "word-thirty-mornings",
      "wheel-well-turned",
      "meal-never-hungry",
      "drink-the-usual",
      "lantern-lamplighter",
      "forage-full-hands",
      "fishing-broad-net",
      "sudoku-clean-grid",
      "matching-deep-water",
      "sorting-cellar-hand",
      "cave-all-the-way-down",
      "scratch-against-the-odds",
      "slots-three-alike",
      "arcade-long-flight",
      "arcade-top-of-the-beech",
      "arcade-through-the-marram",
      "requests-good-for-it",
      "shop-open-for-business",
      "shop-regular-customer",
      "giveaway-left-for-somebody",
      "pet-inseparable",
      "hollow-a-place-of-your-own",
    ]) {
      expect(trophyFor(key), `${key} is missing`).toBeDefined();
    }
  });

  it("returns nothing for a retired key rather than throwing", () => {
    // A row whose trophy has been removed from the catalogue must read as
    // absent, not blow up the profile it is sitting on.
    expect(trophyFor("no-such-trophy")).toBeUndefined();
  });

  it("does not award anything for a near miss", () => {
    // Every trophy is a threshold on a running total or a personal best,
    // so each one has an exact number that turns it on. One short of that
    // number must earn nothing — which catches an off-by-one in either
    // direction across the whole catalogue at once.
    //
    // Scanned rather than sampled. A first attempt tried a handful of
    // likely values and found "the smallest that works" among those, which
    // is not the threshold at all: the fishing trophy wants twelve, the
    // list jumped from ten to fifteen, and the test reported the catalogue
    // as awarding early when it was the test that could not count.
    const level = (value: number) =>
      Object.fromEntries(
        Object.keys(NOTHING).map((key) => [key, value]),
      ) as unknown as TrophyFacts;

    for (const trophy of TROPHIES) {
      let threshold = 0;
      for (let value = 1; value <= 1_000; value += 1) {
        if (trophy.earned(level(value))) {
          threshold = value;
          break;
        }
      }
      expect(threshold, `${trophy.key} needs more than 1000`).toBeGreaterThan(
        0,
      );
      expect(trophy.earned(level(threshold - 1)), `${trophy.key}`).toBe(false);
    }
  });
});
