import type { ItemType } from "@prisma/client";
/**
 * Player-facing vocabulary for pet condition.
 *
 * The server stores and reasons about 0–100 integers
 * (`src/server/modules/pets/pet-stats.ts`) and that does not change. This
 * module is the single place those integers become words, so a companion
 * is described the same way on every screen and a wording change happens
 * once.
 *
 * Why words at all: a number invites optimisation. "Hunger 78/100" asks to
 * be topped up; "Well fed" just tells you how the animal is doing, which is
 * the only thing the player actually needs in order to care for it. It also
 * keeps the interface honest about precision it never really had — the
 * underlying value drifts continuously with time.
 *
 * It lives in `src/lib` rather than a domain module because it is pure
 * presentation with no rules attached, and because client components must
 * be able to import it (nothing under `src/server` may cross that line —
 * docs/conventions.md).
 */

export const PET_STATS = ["hunger", "happiness", "energy", "health"] as const;
export type PetStat = (typeof PET_STATS)[number];

/** Band index, worst (0) to best (4). Also the meter's fill level. */
export type ConditionLevel = 0 | 1 | 2 | 3 | 4;

export const CONDITION_LEVELS = 5;

/**
 * Lower bound of each band. One shared scale across every stat: a player
 * who learns that the fourth band is "good" does not have to relearn it
 * per stat, and the meters stay comparable side by side.
 */
const BAND_MINIMUMS = [0, 15, 35, 60, 85] as const;

/**
 * Worst to best, index-aligned with the band minimums.
 *
 * Deliberately no fatal or punitive language at the bottom of any scale:
 * pets cannot die and missing a day must not feel like a penalty
 * (docs/design-philosophy.md). The lowest states read as "needs you", not
 * as a failure — and health in particular never decays past its floor
 * (HEALTH_DECAY_FLOOR = 20), so "Poorly" is not reachable by neglect
 * alone; the worst a neglected companion looks is "Peaky".
 */
const VOCABULARY: Record<
  PetStat,
  { readonly labels: readonly [string, string, string, string, string]; readonly noun: string }
> = {
  hunger: {
    noun: "Appetite",
    labels: ["Starving", "Hungry", "Content", "Well fed", "Stuffed"],
  },
  happiness: {
    noun: "Spirits",
    labels: ["Downcast", "Glum", "Settled", "Cheerful", "Delighted"],
  },
  energy: {
    noun: "Energy",
    labels: ["Worn out", "Tired", "Rested", "Lively", "Bounding"],
  },
  health: {
    noun: "Health",
    labels: ["Poorly", "Peaky", "Well", "Hearty", "Thriving"],
  },
};

/**
 * Short elaboration, keyed by how the band sits on the scale rather than
 * by stat, so the tone stays consistent. Used for tooltips and as the
 * spoken description behind each meter.
 */
const LEVEL_HINTS: Record<PetStat, readonly [string, string, string, string, string]> = {
  hunger: [
    "Hasn't eaten in far too long.",
    "Would very much like a meal.",
    "Neither stuffed nor wanting.",
    "Comfortably fed.",
    "Could not eat another bite.",
  ],
  happiness: [
    "Out of sorts and in need of company.",
    "A bit low, and it shows.",
    "Quietly at ease.",
    "In good spirits.",
    "Thoroughly pleased with everything.",
  ],
  energy: [
    "Completely spent.",
    "Flagging, and ready to stop.",
    "Reasonably fresh.",
    "Plenty left in reserve.",
    "Practically vibrating.",
  ],
  health: [
    "Under the weather and needs looking after.",
    "A little run down.",
    "Nothing to worry about.",
    "In robust condition.",
    "In the best of health.",
  ],
};

export interface PetCondition {
  stat: PetStat;
  /** How this stat is titled on screen, e.g. "Appetite". */
  noun: string;
  /** The player-facing state, e.g. "Well fed". Never a number. */
  label: string;
  /** One-line elaboration for tooltips and assistive technology. */
  hint: string;
  level: ConditionLevel;
}

/** The band a raw 0–100 value falls into. Out-of-range values clamp. */
export function conditionLevel(value: number): ConditionLevel {
  if (!Number.isFinite(value)) {
    return 0;
  }
  let level: ConditionLevel = 0;
  BAND_MINIMUMS.forEach((minimum, index) => {
    if (value >= minimum) {
      level = index as ConditionLevel;
    }
  });
  return level;
}

/** Describes one stat. The only sanctioned way to render a pet stat. */
export function describeStat(stat: PetStat, value: number): PetCondition {
  const level = conditionLevel(value);
  return {
    stat,
    noun: VOCABULARY[stat].noun,
    label: VOCABULARY[stat].labels[level],
    hint: LEVEL_HINTS[stat][level],
    level,
  };
}

/** Describes every stat, in the order they are presented. */
export function describeStats(
  stats: Record<PetStat, number>,
): PetCondition[] {
  return PET_STATS.map((stat) => describeStat(stat, stats[stat]));
}

/**
 * How filling a food is, for inventory rows and shop shelves.
 *
 * Same reasoning as the stats: "restores 30 hunger" is a number the player
 * would have to do arithmetic with against a number we no longer show, so
 * it becomes a description of the meal instead.
 */
export function describeNourishment(hungerRestore: number | null): string {
  const restore = hungerRestore ?? 0;
  if (restore <= 0) return "Not filling";
  if (restore < 13) return "A nibble";
  if (restore < 20) return "A light snack";
  if (restore < 30) return "A satisfying snack";
  if (restore < 45) return "A hearty meal";
  return "A feast";
}

/**
 * How cheering a toy is. The mirror of describeNourishment: a player
 * choosing between a 22-coin burr and a 260-coin kite deserves to know
 * they differ, without being handed "+15 happiness" to do arithmetic with
 * against a number the game never shows.
 */
export function describeDelight(happinessBoost: number | null): string {
  const boost = happinessBoost ?? 0;
  if (boost <= 0) return "Not much fun";
  if (boost < 10) return "A small amusement";
  if (boost < 18) return "Good fun";
  if (boost < 28) return "A real treat";
  return "An absolute delight";
}

/**
 * The one line describing what an item is for, used wherever a player is
 * deciding whether to acquire one — the shelf, the purchase dialog, the
 * satchel, and the item page. Null when the item has no use to describe.
 *
 * **Exhaustive over `ItemType` on purpose.** This was an if/if/return-null
 * chain taking `type: string | null`, which meant three of the five item
 * types described themselves as nothing: a 3,500-coin book on the
 * bindery's shelf read "Books · 2 in stock" with no hint that reading
 * destroys it, and a token said nothing about the drums. A `Record` keyed
 * by the enum makes a sixth type a compile error here rather than a blank
 * space on four screens.
 *
 * The consumable types say so plainly, because "this is used up" is the
 * single most useful thing a player can know before spending on one.
 */
const USE_SUMMARY: Record<
  ItemType,
  (item: { hungerRestore: number | null; happinessBoost: number | null }) => string
> = {
  FOOD: (item) => describeNourishment(item.hungerRestore),
  TOY: (item) => describeDelight(item.happinessBoost),
  BOOK: () => "Read aloud once, then gone",
  SPIN_TOKEN: () => "One pull of the drums",
  SCRATCH_CARD: () => "Scraped once",
};

export function describeItemUse(item: {
  type: ItemType | string | null;
  hungerRestore: number | null;
  happinessBoost: number | null;
}): string | null {
  if (item.type === null) return null;
  const describe = USE_SUMMARY[item.type as ItemType];
  return describe ? describe(item) : null;
}
