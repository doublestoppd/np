/**
 * A companion's private tastes.
 *
 * Every pet of a species used to be identical to every other one, forever:
 * the same four integers, the same two verbs, the same response to
 * everything. This is the smallest thing that makes one companion a
 * specific animal rather than a copy — a set of tastes, derived from a
 * per-pet seed over the tag vocabulary the world already uses, which the
 * player finds out by offering things.
 *
 * Three rules hold it together, and all three are load-bearing:
 *
 * 1. **The game never states the palate.** No view model, action result,
 *    log line, or error carries the seed or the tags. The reaction copy
 *    never names the tag either — "Ember has taken the ball to the far
 *    corner and is guarding it from nobody" leaves the inference with the
 *    player, where it can be wrong, revised, and told to somebody else.
 *    "Ember loves salvaged things" hands over the answer key and turns
 *    discovery into a lookup.
 * 2. **Nothing is ever worse than it was.** An indifference is
 *    mechanically identical to an ordinary outcome — same hunger, same
 *    happiness, drier sentence. A player must never be scolded about an
 *    item they just paid for, and a test enforces that no (item, palate)
 *    pair can produce less than the pre-palate baseline.
 * 3. **The bonus is flat, not proportional.** A delight is worth the same
 *    on a 12-coin cluster as on a 150-coin cake, so learning what your
 *    companion likes never collapses the food catalogue into "the most
 *    filling item carrying the right tag".
 *
 * This module is pure and imports no Prisma, for the same reason
 * `starter-pack.ts` and `play-config.ts` are: offline content validation
 * imports it to check that every taste is actually discoverable.
 */

/**
 * Tags a food delight may be drawn from. A tag is eligible only when
 * enough foods carry it that a player can stumble into the answer by
 * ordinary play; content validation enforces the floor.
 */
export const PALATE_FOOD_TAGS = [
  "sweet",
  "baked",
  "foraged",
  "woodland",
  "salted",
  "preserved",
] as const;

/** The same, for toys. */
export const PALATE_TOY_TAGS = [
  "salvaged",
  "woodland",
  "keepsake",
  "tidal",
] as const;

/** How many distinct foods must carry a food-delight tag to be fair. */
export const MIN_FOODS_PER_TASTE = 3;
/** How many distinct toys must carry a toy-delight tag to be fair. */
export const MIN_TOYS_PER_TASTE = 2;

/** Happiness a delighting meal adds. Flat, so price never dominates. */
export const DELIGHT_FOOD_HAPPINESS = 8;
/** And for the one it is really particular about. */
export const PARTICULAR_FOOD_HAPPINESS = 16;
/** A delighting toy is worth half again; a particular one, double. */
export const DELIGHT_TOY_MULTIPLIER = 1.5;
export const PARTICULAR_TOY_MULTIPLIER = 2;

/**
 * One in this many of a companion's delights is something it is
 * *particular* about — the specific object, not the kind of object. Some
 * companions have none, which is fine: nothing anywhere promises one.
 */
const PARTICULAR_IN = 5;

export interface Palate {
  foodDelight: string;
  toyDelight: string;
  /** One tag from either pool that this companion is unmoved by. */
  indifference: string;
}

export type PetReaction =
  | "ordinary"
  | "delighted"
  | "particular"
  | "indifferent";

/**
 * Stable, seeded, and identical across processes and restarts.
 *
 * FNV-1a followed by an avalanche step. The finalizer is not decoration:
 * without it the three draws from one seed correlated hard enough that two
 * thousand companions produced only thirty-nine distinct palates, because
 * the low bits barely moved between `seed:food` and `seed:toy`.
 */
function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619) >>> 0;
  }
  result ^= result >>> 16;
  result = Math.imul(result, 2246822507) >>> 0;
  result ^= result >>> 13;
  result = Math.imul(result, 3266489909) >>> 0;
  return (result ^= result >>> 16) >>> 0;
}

function pick<T>(pool: readonly T[], seed: string, salt: string): T {
  return pool[hash(`${seed}:${salt}`) % pool.length] as T;
}

/**
 * Derives a companion's tastes from its seed. Pure and deterministic: the
 * palate on day 300 is the palate on day 1, so nothing a player learns can
 * ever stop being true.
 */
export function palateFor(seed: string): Palate {
  const foodDelight = pick(PALATE_FOOD_TAGS, seed, "food");
  const toyDelight = pick(PALATE_TOY_TAGS, seed, "toy");
  // An indifference that is also a delight would be a contradiction, so
  // the pool is filtered before drawing rather than redrawn after.
  const others = [...PALATE_FOOD_TAGS, ...PALATE_TOY_TAGS].filter(
    (tag) => tag !== foodDelight && tag !== toyDelight,
  );
  return {
    foodDelight,
    toyDelight,
    indifference: pick(others, seed, "meh"),
  };
}

/**
 * What this companion makes of a particular thing.
 *
 * Takes the item's tags rather than the item, so this stays pure and the
 * caller decides where tags come from (in practice: the same in-transaction
 * read that already checks the item's lifecycle).
 */
export function reactionFor(
  palate: Palate,
  seed: string,
  item: { slug: string; tagSlugs: readonly string[]; kind: "FOOD" | "TOY" },
): PetReaction {
  const delight = item.kind === "FOOD" ? palate.foodDelight : palate.toyDelight;
  if (item.tagSlugs.includes(delight)) {
    return hash(`${seed}:particular:${item.slug}`) % PARTICULAR_IN === 0
      ? "particular"
      : "delighted";
  }
  if (item.tagSlugs.includes(palate.indifference)) {
    return "indifferent";
  }
  return "ordinary";
}

/** Extra happiness a meal earns beyond restoring hunger. Never negative. */
export function foodHappinessBonus(reaction: PetReaction): number {
  if (reaction === "particular") return PARTICULAR_FOOD_HAPPINESS;
  if (reaction === "delighted") return DELIGHT_FOOD_HAPPINESS;
  return 0;
}

/**
 * What a toy is actually worth to this companion. Never less than the
 * toy's own boost — an indifference costs the player nothing.
 */
export function toyHappiness(reaction: PetReaction, boost: number): number {
  if (reaction === "particular") return Math.floor(boost * PARTICULAR_TOY_MULTIPLIER);
  if (reaction === "delighted") return Math.floor(boost * DELIGHT_TOY_MULTIPLIER);
  return boost;
}

/** True when this outcome is worth remembering on the shelf. */
export function isDelight(reaction: PetReaction): boolean {
  return reaction === "delighted" || reaction === "particular";
}
