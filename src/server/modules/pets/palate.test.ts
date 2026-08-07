import { describe, expect, it } from "vitest";
import {
  DELIGHT_FOOD_HAPPINESS,
  foodHappinessBonus,
  isDelight,
  PALATE_FOOD_TAGS,
  PALATE_TOY_TAGS,
  palateFor,
  PARTICULAR_FOOD_HAPPINESS,
  reactionFor,
  toyHappiness,
  type PetReaction,
} from "./palate";

const SEEDS = Array.from({ length: 2_000 }, (_, i) => `seed-${i}-abcdef`);

describe("palateFor", () => {
  it("is deterministic, so what a player learns never stops being true", () => {
    for (const seed of SEEDS.slice(0, 50)) {
      expect(palateFor(seed)).toEqual(palateFor(seed));
    }
  });

  it("draws only from the declared pools", () => {
    for (const seed of SEEDS) {
      const palate = palateFor(seed);
      expect(PALATE_FOOD_TAGS).toContain(palate.foodDelight);
      expect(PALATE_TOY_TAGS).toContain(palate.toyDelight);
      expect([...PALATE_FOOD_TAGS, ...PALATE_TOY_TAGS]).toContain(
        palate.indifference,
      );
    }
  });

  it("never makes a companion both love and ignore the same thing", () => {
    for (const seed of SEEDS) {
      const palate = palateFor(seed);
      expect(palate.indifference).not.toBe(palate.foodDelight);
      expect(palate.indifference).not.toBe(palate.toyDelight);
    }
  });

  it("leaves no taste unreachable", () => {
    // A tag no companion can ever be given is content nobody will meet.
    const foods = new Set<string>();
    const toys = new Set<string>();
    for (const seed of SEEDS) {
      const palate = palateFor(seed);
      foods.add(palate.foodDelight);
      toys.add(palate.toyDelight);
    }
    expect([...foods].sort()).toEqual([...PALATE_FOOD_TAGS].sort());
    expect([...toys].sort()).toEqual([...PALATE_TOY_TAGS].sort());
  });

  it("spreads companions across many distinguishable palates", () => {
    const seen = new Set(
      SEEDS.map((seed) => Object.values(palateFor(seed)).join("|")),
    );
    // 6 food tags x 4 toy tags x the surviving indifferences.
    expect(seen.size).toBeGreaterThan(100);
  });
});

describe("reactionFor", () => {
  const palate = palateFor("fixed-seed-for-reactions");

  it("delights at the tag it likes and is unmoved by the one it does not", () => {
    expect(
      reactionFor(palate, "fixed-seed-for-reactions", {
        slug: "a-thing",
        tagSlugs: [palate.foodDelight],
        kind: "FOOD",
      }),
    ).not.toBe("ordinary");
    expect(
      reactionFor(palate, "fixed-seed-for-reactions", {
        slug: "another-thing",
        tagSlugs: [palate.indifference],
        kind: "FOOD",
      }),
    ).toBe("indifferent");
    expect(
      reactionFor(palate, "fixed-seed-for-reactions", {
        slug: "third-thing",
        tagSlugs: ["river"],
        kind: "FOOD",
      }),
    ).toBe("ordinary");
  });

  it("reads food tags for food and toy tags for toys", () => {
    // A food carrying the toy delight is not a delight, and the reverse:
    // otherwise every companion would love half the catalogue by accident.
    const foodWithToyTag = reactionFor(palate, "s", {
      slug: "x",
      tagSlugs: [palate.toyDelight],
      kind: "FOOD",
    });
    expect(foodWithToyTag).not.toBe("delighted");
    expect(foodWithToyTag).not.toBe("particular");
  });

  it("is particular about a few specific things, not all of them", () => {
    const seed = "seed-for-particulars";
    const p = palateFor(seed);
    const reactions = Array.from({ length: 200 }, (_, i) =>
      reactionFor(p, seed, {
        slug: `item-${i}`,
        tagSlugs: [p.foodDelight],
        kind: "FOOD",
      }),
    );
    const particulars = reactions.filter((r) => r === "particular").length;
    expect(particulars).toBeGreaterThan(0);
    expect(particulars).toBeLessThan(reactions.length / 2);
  });
});

describe("the palate can never make anything worse", () => {
  // The load-bearing invariant. A player must never be scolded about an
  // item they just paid for, so an indifference is mechanically identical
  // to an ordinary outcome and every bonus is additive.
  const REACTIONS: PetReaction[] = [
    "ordinary",
    "delighted",
    "particular",
    "indifferent",
  ];

  it("never subtracts happiness from a meal", () => {
    for (const reaction of REACTIONS) {
      expect(foodHappinessBonus(reaction)).toBeGreaterThanOrEqual(0);
    }
    expect(foodHappinessBonus("indifferent")).toBe(0);
    expect(foodHappinessBonus("ordinary")).toBe(0);
    expect(foodHappinessBonus("delighted")).toBe(DELIGHT_FOOD_HAPPINESS);
    expect(foodHappinessBonus("particular")).toBe(PARTICULAR_FOOD_HAPPINESS);
  });

  it("never makes a toy worth less than its own boost", () => {
    for (const reaction of REACTIONS) {
      for (const boost of [1, 10, 15, 18, 20, 30, 100]) {
        expect(toyHappiness(reaction, boost)).toBeGreaterThanOrEqual(boost);
      }
    }
    expect(toyHappiness("indifferent", 20)).toBe(20);
    expect(toyHappiness("ordinary", 20)).toBe(20);
    expect(toyHappiness("delighted", 20)).toBe(30);
    expect(toyHappiness("particular", 20)).toBe(40);
  });

  it("remembers only the outcomes worth remembering", () => {
    expect(isDelight("delighted")).toBe(true);
    expect(isDelight("particular")).toBe(true);
    expect(isDelight("ordinary")).toBe(false);
    expect(isDelight("indifferent")).toBe(false);
  });
});
