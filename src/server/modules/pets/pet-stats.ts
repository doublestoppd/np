/**
 * Timestamp-based pet stat decay.
 *
 * Stats are stored as snapshots taken at `statsUpdatedAt`; current values are
 * derived by applying decay for the elapsed time. Design constraints:
 * - Pets cannot die. Health never decays below HEALTH_DECAY_FLOOR (or below
 *   its current value when already lower).
 * - Missing a day must not permanently disadvantage a player: everything is
 *   recoverable by feeding and play, and hunger/happiness/energy floor at 0.
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
  energy: 2,
} as const;

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
  const energy = clampStat(stats.energy - DECAY_PER_HOUR.energy * hours);

  // Health regenerates while the pet still has hunger reserves, then decays
  // once hunger hits zero — but never below the floor.
  const hoursUntilStarving = stats.hunger / DECAY_PER_HOUR.hunger;
  const fedHours = Math.min(hours, hoursUntilStarving);
  const starvingHours = hours - fedHours;

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
