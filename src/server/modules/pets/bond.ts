/**
 * The bond: a record of what you and this companion have done together
 * (ADR-60). PURE — no database, no clock.
 *
 * **It only ever goes up, and that is the entire design.** Every other
 * number describing a companion is a state to maintain: hunger falls,
 * spirits sag, the coat needs doing. This one is a history. A bond that
 * faded while nobody visited would be the punitive-inactivity mechanic
 * CLAUDE.md rules out, wearing the friendliest possible face — "your
 * companion has forgotten you" is the cruellest sentence a pet game can
 * print, and this one will never print it.
 *
 * It is also never compared against another player's. The bands below are
 * a description of one relationship, not a rank in anybody's league; there
 * is no leaderboard, no percentile, and no "top 10% of owners".
 *
 * What it DOES, mechanically, is small and deliberately one-directional:
 * a companion you have looked after for a long time is a little less
 * likely to pick something up, and shakes it off a little faster. That is
 * a reward for care rather than a penalty for its absence — a brand-new
 * companion is at the baseline, not below it.
 */

export interface BondBand {
  name: string;
  blurb: string;
  /** Lower bound, inclusive. */
  minimum: number;
}

/**
 * Worst to best. The last band's threshold is reachable by an ordinary
 * player in a few months of ordinary care, and nothing beyond it exists —
 * a ladder with a rung nobody reaches is a ladder that says "not yet"
 * forever.
 */
export const BOND_BANDS: readonly BondBand[] = [
  {
    minimum: 0,
    name: "Newly met",
    blurb: "Still working out what you are for.",
  },
  {
    minimum: 60,
    name: "Warming to you",
    blurb: "Comes over when you arrive, most times.",
  },
  {
    minimum: 200,
    name: "Fond of you",
    blurb: "Waits by the door, and has opinions about how long you were.",
  },
  {
    minimum: 500,
    name: "Attached",
    blurb: "Follows you room to room without appearing to decide to.",
  },
  {
    minimum: 1_000,
    name: "Inseparable",
    blurb: "Has arranged its whole life around yours and considers this settled.",
  },
];

export function bondBand(bond: number): BondBand {
  let found = BOND_BANDS[0] as BondBand;
  for (const band of BOND_BANDS) {
    if (bond >= band.minimum) found = band;
  }
  return found;
}

/**
 * Progress through the CURRENT band, 0..1. Full at the top band.
 *
 * Full rather than empty at the top for the reason the reading shelf
 * gives: a bar that can never fill is a bar that always says "not yet".
 */
export function bondBandProgress(bond: number): number {
  const index = BOND_BANDS.findIndex((band) => band === bondBand(bond));
  const next = BOND_BANDS[index + 1];
  if (!next) return 1;
  const floor = (BOND_BANDS[index] as BondBand).minimum;
  return Math.min(1, Math.max(0, (bond - floor) / (next.minimum - floor)));
}

/**
 * What each act of care is worth.
 *
 * Reading is worth most because it is the one that costs the book. Feeding
 * is worth least because it happens most. None of them is worth enough
 * that grinding one is faster than simply looking after the animal.
 */
export const BOND_FOR = {
  feed: 1,
  play: 2,
  groom: 2,
  /**
   * Sitting down and doing nothing else (ADR-61).
   *
   * Worth more than a meal despite costing nothing, and that ordering is
   * the whole argument for the feature: what a companion is owed is not
   * purchasable, and a game where the bond ladder was climbed fastest by
   * spending would be saying the opposite. It is still the slowest way to
   * climb it in practice, because it is on a three-hour cooldown and the
   * others are not.
   */
  sit: 3,
  read: 4,
  /** Sitting with something that is under the weather counts for more. */
  treat: 5,
} as const;

export type BondAction = keyof typeof BOND_FOR;
