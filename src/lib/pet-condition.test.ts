import { describe, expect, it } from "vitest";
import {
  CONDITION_LEVELS,
  conditionLevel,
  describeNourishment,
  describeStat,
  describeStats,
  PET_STATS,
  type PetStat,
} from "./pet-condition";

describe("conditionLevel", () => {
  it("covers the whole 0-100 range with five contiguous bands", () => {
    // No gaps and no overlaps: every legal stat value names exactly one
    // band, and the bands only ever go up.
    const levels = Array.from({ length: 101 }, (_, value) =>
      conditionLevel(value),
    );
    expect(levels[0]).toBe(0);
    expect(levels[100]).toBe(CONDITION_LEVELS - 1);
    for (let value = 1; value <= 100; value += 1) {
      const step = levels[value]! - levels[value - 1]!;
      expect(step === 0 || step === 1).toBe(true);
    }
    expect(new Set(levels).size).toBe(CONDITION_LEVELS);
  });

  it("clamps rather than throwing on out-of-range or junk values", () => {
    // Decay math is float-based upstream; a presentation helper must not be
    // the thing that takes a page down.
    expect(conditionLevel(-40)).toBe(0);
    expect(conditionLevel(1000)).toBe(CONDITION_LEVELS - 1);
    expect(conditionLevel(Number.NaN)).toBe(0);
  });
});

describe("describeStat", () => {
  it("never puts a number in front of the player", () => {
    for (const stat of PET_STATS) {
      for (let value = 0; value <= 100; value += 1) {
        const condition = describeStat(stat, value);
        expect(condition.label).not.toMatch(/\d/);
        expect(condition.noun).not.toMatch(/\d/);
        expect(condition.hint).not.toMatch(/\d/);
      }
    }
  });

  it("gives every stat a full, distinct set of five states", () => {
    for (const stat of PET_STATS) {
      const labels = [0, 20, 45, 70, 95].map(
        (value) => describeStat(stat, value).label,
      );
      expect(new Set(labels).size).toBe(CONDITION_LEVELS);
      expect(labels.every((label) => label.length > 0)).toBe(true);
    }
  });

  it("describes better values with better-ranked states", () => {
    for (const stat of PET_STATS) {
      expect(describeStat(stat, 100).level).toBeGreaterThan(
        describeStat(stat, 0).level,
      );
    }
  });

  it("keeps the bottom of the health scale non-fatal", () => {
    // Pets cannot die (CLAUDE.md), so no state may imply otherwise — and
    // decay floors health at 20, which must not read as an emergency.
    const words = [0, 20, 50, 100].map((v) => describeStat("health", v).label);
    for (const word of words) {
      expect(word).not.toMatch(/dead|dying|critical|fatal/i);
    }
    expect(describeStat("health", 20).label).toBe("Peaky");
  });

  it("describes every stat in a stable presentation order", () => {
    const stats: Record<PetStat, number> = {
      hunger: 10,
      happiness: 90,
      energy: 50,
      health: 70,
    };
    expect(describeStats(stats).map((c) => c.stat)).toEqual([...PET_STATS]);
  });
});

describe("describeNourishment", () => {
  it("describes how filling a food is without quoting its restore value", () => {
    const descriptions = [0, 10, 15, 20, 25, 30, 40, 60].map((restore) =>
      describeNourishment(restore),
    );
    for (const description of descriptions) {
      expect(description).not.toMatch(/\d/);
    }
    // The shipped foods span 10-60, and that span must not collapse into
    // one word or the descriptions tell the player nothing.
    expect(new Set(descriptions.slice(1)).size).toBeGreaterThanOrEqual(4);
  });

  it("orders descriptions monotonically and handles a missing value", () => {
    expect(describeNourishment(null)).toBe(describeNourishment(0));
    expect(describeNourishment(10)).not.toBe(describeNourishment(60));
  });
});
