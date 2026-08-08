/**
 * Timestamp-based pet stat decay.
 *
 * Stats are stored as snapshots taken at `statsUpdatedAt`; current values are
 * derived by applying decay for the elapsed time. Design constraints:
 * - Pets cannot die. No need decays below its floor (or below its current
 *   value when already lower): HEALTH_DECAY_FLOOR for health,
 *   NEED_DECAY_FLOOR for hunger and happiness.
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
  /**
   * How well kept the coat is (ADR-60). Optional so every existing caller
   * — the tests, the older commands — keeps compiling and keeps meaning
   * what it meant; absent is treated as "not tracked" and passed through
   * untouched rather than defaulted to something the caller did not say.
   */
  coat?: number;
}

export const STAT_MIN = 0;
export const STAT_MAX = 100;

/** Health never decays below this value, so pets always recover. */
export const HEALTH_DECAY_FLOOR = 20;

/**
 * Hunger and happiness never decay below this either (ADR-54).
 *
 * ADR-35 retuned decay because the home screen was telling an attentive
 * daily player they were failing. It made that argument against a
 * once-a-day cadence and stopped there. A six-month simulation of a
 * twice-a-week player found the same reproach one cadence out: hunger
 * zeroes 33 hours after a visit and then sits at 0 for the remaining two
 * days, so somebody who plays on Tuesdays and Saturdays only ever opens
 * the game to "Starving" and "Downcast".
 *
 * 15 is the bottom of the second condition band, which is exactly where
 * HEALTH_DECAY_FLOOR already puts a neglected companion. So all three
 * meters now agree: the worst a companion looks from absence alone is
 * "needs you", never the bottom of the scale. Nothing is lost by being
 * away and there is still every reason to come back.
 *
 * This is a floor on DECAY, not a minimum on the stat. A companion below
 * it — fed a little and left, say — is not raised to 15 by the passage of
 * time.
 */
export const NEED_DECAY_FLOOR = 15;

/**
 * Decay rates, chosen against a once-a-day player (ADR-35).
 *
 * At the previous 4/hr, hunger fell 96 in a day against a ceiling of 100 —
 * four points of slack. Someone logging in every twenty-four hours arrived
 * to a companion reading "Starving" every single day, with no play pattern
 * that could avoid it, and health began decaying an hour later. The most
 * prominent thing on the home screen told an attentive player they were
 * failing, permanently.
 *
 * At 3/hr hunger falls 72 a day: a daily visitor arrives at 28 — "Hungry",
 * which is a companion pleased to see you — and the zero-hunger cliff
 * moves from 25 hours to 33, so a late login is late rather than
 * punished.
 *
 * Happiness at 2/hr falls 48 a day. That is what three toys cover; at
 * 3/hr it took all five, including the 260-coin kite, merely to break
 * even, which made the expensive toy compulsory rather than nice.
 */
export const DECAY_PER_HOUR = {
  hunger: 3,
  happiness: 2,
  /**
   * The coat falls slowest of the three (ADR-60), and deliberately.
   *
   * Grooming tools are KEPT rather than consumed, so the limiter on
   * brushing is a per-tool cooldown rather than a cost — which means a
   * fast-falling coat would just be a button to press more often. At 1/hr
   * it drops 24 a day: a player who brushes with two different tools
   * every couple of days stays on top of it comfortably, and one who
   * never brushes at all lands on the same floor as everything else and
   * looks unkempt rather than neglected.
   */
  coat: 1,
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
 *
 * The rate is set so the meter actually MOVES. At 5/hr against a maximum
 * possible spend of 20 a day, energy sat pinned at 100 and was a constant
 * drawn as a meter. At 3/hr, a session that plays through a full toy box
 * visibly tires a companion and a night's rest visibly restores it.
 */
export const ENERGY_REGEN_PER_HOUR = 3;

/** Health slowly regenerates while the pet is fed (hunger above zero). */
export const HEALTH_REGEN_PER_HOUR = 1;

/** Health declines only once hunger has fully run out. */
export const HEALTH_DECAY_PER_HOUR = 2;

export function clampStat(value: number): number {
  return Math.min(STAT_MAX, Math.max(STAT_MIN, value));
}

/**
 * Subtracts `amount`, stopping at NEED_DECAY_FLOOR — or at the current
 * value when it already sits below, so time never raises a stat.
 */
function decayToFloor(value: number, amount: number): number {
  const floor = Math.min(value, NEED_DECAY_FLOOR);
  return clampStat(Math.max(floor, value - amount));
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

  const hunger = decayToFloor(stats.hunger, DECAY_PER_HOUR.hunger * hours);
  const coat =
    stats.coat === undefined
      ? undefined
      : Math.round(decayToFloor(stats.coat, DECAY_PER_HOUR.coat * hours));
  const happiness = decayToFloor(
    stats.happiness,
    DECAY_PER_HOUR.happiness * hours,
  );

  // Health and energy both recover only while the pet still has hunger
  // reserves; health additionally declines once those run out.
  //
  // "Run out" means reaching the hunger floor rather than reaching zero.
  // That distinction is load-bearing: with hunger floored at 15 and
  // starvation still defined as 0, hunger could never get there, health
  // would never decline, and the health meter would be decoration. So the
  // floor IS empty, and everything downstream of an empty stomach happens
  // exactly when it used to.
  const hoursUntilStarving = Math.max(
    0,
    (stats.hunger - NEED_DECAY_FLOOR) / DECAY_PER_HOUR.hunger,
  );
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
    ...(coat === undefined ? {} : { coat }),
  };
}
