/**
 * The anti-treadmill rule, in one place.
 *
 * A coin-priced game of chance must never pay out another game of chance.
 * A token that pays out tokens, or a chit that pays out chits, is a loop
 * that runs without ever touching the rest of the game — and a machine
 * that pays out somebody else's fuel is the same loop with a hop in it.
 *
 * **This existed in four places and two of them had already drifted.** The
 * runtime copies in `modules/slots/spin.ts` and `modules/scratch/scratch.ts`
 * both refused a token OR a chit; the offline validator refused both for
 * the drums and only a chit for the chits. So a scratch card whose prize
 * was a spin token passed `npm run content:validate`, seeded cleanly, and
 * then threw `TABLE_UNAVAILABLE` at a weighted share of scrapes — with the
 * check that exists specifically to catch that saying the content was
 * fine.
 *
 * Here so that the granting path and the build step cannot disagree
 * again. Pure, so `prisma/seed/validation.ts` can import it offline.
 *
 * Deliberately expressed over the item TYPE rather than over a list of
 * slugs: the rule is about what a thing is, and a new kind of chance item
 * should have to be added here on purpose.
 */

/** Item types that are themselves a game of chance. */
export const CHANCE_ITEM_TYPES = ["SPIN_TOKEN", "SCRATCH_CARD"] as const;

/**
 * True when this item may not be a prize in a game of chance.
 *
 * Takes a loose string because the two callers hold the type differently:
 * the runtime reads it off a Prisma row, the validator off an authored
 * content object where it may be absent.
 */
export function isChanceItemType(type: string | null | undefined): boolean {
  return (CHANCE_ITEM_TYPES as readonly string[]).includes(type ?? "");
}

/** What to tell an author who wrote one anyway. */
export const CHANCE_NESTING_MESSAGE =
  "a game of chance must never award a token or a chit";
