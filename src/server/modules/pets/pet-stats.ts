/**
 * Timestamp-based pet stat decay.
 *
 * Stats are stored as snapshots taken at `statsUpdatedAt`; current values are
 * derived by applying decay for the elapsed time. Design constraints:
 * - Pets cannot die. Health never decays below HEALTH_DECAY_FLOOR (or below
 *   its current value when already lower).
 * - Missing a day must not permanently disadvantage a player: everything is
 *   recoverable. Hunger falls and feeding raises it; happiness falls and
 *   playing raises it; energy is spent by play and refills on its own while
 *   fed; health tracks whether the companion has been fed at all. Every
 *   stat the player can see has either an action or a consequence — a
 *   meter with neither is decoration that reads as failure.
 */

export interface PetStatSnapshot {
  hunger: number;
  happiness: number;
  energy: number;
  health: number;
}

export const STAT_MIN = 0;
export const STAT_MAX = 100;

/** Health never decays below this value, so pets always recover. */
export const HEALTH_DECAY_FLOOR = 20;

export const DECAY_PER_HOUR = {
  hunger: 4,
  happiness: 3,
} as const;

/**
 * Energy REGENERATES; it is the only stat that does. Play spends it and
 * rest restores it, and resting is what a companion does while you are
 * elsewhere — so the recovery is the passage of time rather than a button
 * that exists only to be clicked. Gated on being fed, like health: a
 * starving companion recovers nothing.
 *
 * This is also why energy never blocks anything (CLAUDE.md forbids energy
 * gates on play). It is a budget that refills on its own, not a lock.
 */
export const ENERGY_REGEN_PER_HOUR = 5;

/** Health slowly regenerates while the pet is fed (hunger above zero). */
export const HEALTH_REGEN_PER_HOUR = 1;

/** Health declines only once hunger has fully run out. */
export const HEALTH_DECAY_PER_HOUR = 2;

export function clampStat(value: number): number {
  return Math.min(STAT_MAX, Math.max(STAT_MIN, value));
}

/**
 * Returns the stats as they stand at `now`, given a snapshot taken at `from`.
 * Pure and deterministic; negative elapsed time (clock skew) is treated as no
 * elapsed time. Results are rounded to integers for storage and display.
 */
export function applyStatDecay(
  stats: PetStatSnapshot,
  from: Date,
  now: Date,
): PetStatSnapshot {
  const elapsedMs = now.getTime() - from.getTime();
  if (elapsedMs <= 0) {
    return { ...stats };
  }
  const hours = elapsedMs / 3_600_000;

  const hunger = clampStat(stats.hunger - DECAY_PER_HOUR.hunger * hours);
  const happiness = clampStat(
    stats.happiness - DECAY_PER_HOUR.happiness * hours,
  );

  // Health and energy both recover only while the pet still has hunger
  // reserves; health additionally declines once those run out.
  const hoursUntilStarving = stats.hunger / DECAY_PER_HOUR.hunger;
  const fedHours = Math.min(hours, hoursUntilStarving);
  const starvingHours = hours - fedHours;

  const energy = clampStat(stats.energy + ENERGY_REGEN_PER_HOUR * fedHours);

  let health = clampStat(stats.health + HEALTH_REGEN_PER_HOUR * fedHours);
  if (starvingHours > 0) {
    const floor = Math.min(health, HEALTH_DECAY_FLOOR);
    health = Math.max(floor, health - HEALTH_DECAY_PER_HOUR * starvingHours);
  }

  return {
    hunger: Math.round(hunger),
    happiness: Math.round(happiness),
    energy: Math.round(energy),
    health: Math.round(health),
  };
}
