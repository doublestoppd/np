import { describe, expect, it } from "vitest";
import {
  applyStatDecay,
  clampStat,
  DECAY_PER_HOUR,
  ENERGY_REGEN_PER_HOUR,
  HEALTH_DECAY_FLOOR,
  HEALTH_DECAY_PER_HOUR,
  HEALTH_REGEN_PER_HOUR,
  type PetStatSnapshot,
} from "./pet-stats";

const BASE: PetStatSnapshot = {
  hunger: 80,
  happiness: 80,
  energy: 80,
  health: 90,
};

const T0 = new Date("2026-08-01T00:00:00Z");

function hoursLater(hours: number): Date {
  return new Date(T0.getTime() + hours * 3_600_000);
}

describe("clampStat", () => {
  it("clamps below zero to zero", () => {
    expect(clampStat(-5)).toBe(0);
  });

  it("clamps above 100 to 100", () => {
    expect(clampStat(140)).toBe(100);
  });

  it("passes through in-range values", () => {
    expect(clampStat(55)).toBe(55);
  });
});

describe("applyStatDecay", () => {
  it("returns stats unchanged when no time has passed", () => {
    expect(applyStatDecay(BASE, T0, T0)).toEqual(BASE);
  });

  it("treats negative elapsed time (clock skew) as no elapsed time", () => {
    expect(applyStatDecay(BASE, T0, hoursLater(-3))).toEqual(BASE);
  });

  it("does not mutate the input snapshot", () => {
    const input = { ...BASE };
    applyStatDecay(input, T0, hoursLater(10));
    expect(input).toEqual(BASE);
  });

  it("decays hunger and happiness at their hourly rates", () => {
    const result = applyStatDecay(BASE, T0, hoursLater(10));
    expect(result.hunger).toBe(BASE.hunger - DECAY_PER_HOUR.hunger * 10);
    expect(result.happiness).toBe(
      BASE.happiness - DECAY_PER_HOUR.happiness * 10,
    );
  });

  it("handles fractional hours and rounds to integers", () => {
    // Derived from the rates rather than restating them: these assert
    // that a fraction of an hour is applied and rounded, not what the
    // rates happen to be today.
    const result = applyStatDecay(BASE, T0, hoursLater(2.5));
    expect(result.hunger).toBe(
      Math.round(BASE.hunger - DECAY_PER_HOUR.hunger * 2.5),
    );
    expect(result.happiness).toBe(
      Math.round(BASE.happiness - DECAY_PER_HOUR.happiness * 2.5),
    );
    for (const value of Object.values(result)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("a once-a-day visitor is greeted by a companion, not a crisis", () => {
    // The rule this protects (ADR-35): 24 hours of decay must leave real
    // room above zero. At 4/hr it left four points, so an attentive daily
    // player was told their companion was starving every single day.
    const daily = applyStatDecay(
      { hunger: 100, happiness: 100, energy: 100, health: 100 },
      T0,
      hoursLater(24),
    );
    expect(daily.hunger).toBeGreaterThanOrEqual(20);
    expect(daily.happiness).toBeGreaterThanOrEqual(20);
    // And a late login is late, not punished: hunger must not reach zero
    // before well past a day.
    const late = applyStatDecay(
      { hunger: 100, happiness: 100, energy: 100, health: 100 },
      T0,
      hoursLater(30),
    );
    expect(late.hunger).toBeGreaterThan(0);
    expect(late.health).toBe(100);
  });

  it("regenerates energy while the companion is fed, and caps it", () => {
    // Energy is the one stat that recovers on its own — play spends it and
    // rest restores it, and resting is what happens while you are away.
    const rested = applyStatDecay(
      { ...BASE, energy: 40 },
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-01T04:00:00Z"),
    );
    expect(rested.energy).toBe(40 + ENERGY_REGEN_PER_HOUR * 4);

    const full = applyStatDecay(
      { ...BASE, energy: 95 },
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-01T10:00:00Z"),
    );
    expect(full.energy).toBe(100);
  });

  it("stops regenerating energy once hunger has run out", () => {
    // Two fed hours' worth of hunger, then nothing recovers.
    const fedHours = 2;
    const result = applyStatDecay(
      { ...BASE, hunger: DECAY_PER_HOUR.hunger * fedHours, energy: 10 },
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-01-01T10:00:00Z"),
    );
    expect(result.hunger).toBe(0);
    expect(result.energy).toBe(10 + ENERGY_REGEN_PER_HOUR * fedHours);
  });

  it("floors hunger and happiness at zero after a long absence", () => {
    const result = applyStatDecay(BASE, T0, hoursLater(24 * 30));
    expect(result.hunger).toBe(0);
    expect(result.happiness).toBe(0);
  });

  it("regenerates health while the pet is still fed", () => {
    // 80 hunger / 4 per hour = 20 hours of reserves; 5 hours is well within.
    const result = applyStatDecay(BASE, T0, hoursLater(5));
    expect(result.health).toBe(BASE.health + HEALTH_REGEN_PER_HOUR * 5);
  });

  it("caps regenerated health at 100", () => {
    const result = applyStatDecay({ ...BASE, health: 98 }, T0, hoursLater(10));
    expect(result.health).toBe(100);
  });

  it("decays health only after hunger runs out", () => {
    const fedHours = BASE.hunger / DECAY_PER_HOUR.hunger;
    const totalHours = fedHours + 10;
    const result = applyStatDecay(BASE, T0, hoursLater(totalHours));
    expect(result.health).toBe(
      Math.min(100, BASE.health + HEALTH_REGEN_PER_HOUR * fedHours) -
        HEALTH_DECAY_PER_HOUR * 10,
    );
  });

  it("never decays health below the floor, so pets cannot die", () => {
    const result = applyStatDecay(BASE, T0, hoursLater(24 * 365));
    expect(result.health).toBe(HEALTH_DECAY_FLOOR);
  });

  it("does not raise health to the floor when it is already below it", () => {
    const weak = { ...BASE, hunger: 0, health: 10 };
    const result = applyStatDecay(weak, T0, hoursLater(50));
    expect(result.health).toBe(10);
  });

  it("keeps every stat within 0-100 for arbitrary elapsed times", () => {
    for (const hours of [0.1, 1, 7, 33, 100, 1000]) {
      const result = applyStatDecay(BASE, T0, hoursLater(hours));
      for (const value of Object.values(result)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});
