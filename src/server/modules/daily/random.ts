import { randomInt } from "node:crypto";

/**
 * Cryptographically secure weighted selection for private per-player
 * outcomes (wheel prizes, meal picks). Deliberately NOT deterministic —
 * date-seeded determinism is for shared public content (word puzzles,
 * shop restocks), never for individual results a player could precompute.
 * Raw random values are never logged or returned.
 */
export function pickWeighted<T extends { weight: number }>(entries: T[]): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (entries.length === 0 || total <= 0) {
    throw new Error("pickWeighted requires entries with positive total weight");
  }
  let roll = randomInt(0, total);
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) {
      return entry;
    }
  }
  return entries[entries.length - 1] as T;
}

/** Uniform secure integer in the inclusive range [min, max]. */
export function secureQuantity(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return randomInt(min, max + 1);
}

/**
 * One line at random from a newline-joined flavour block.
 *
 * Lived twice — once in `modules/foraging/search.ts`, once in
 * `modules/fishing/cast.ts` — and the two copies had drifted on the one
 * line that matters: the empty-block fallback. Foraging returned "Nothing
 * this time."; fishing returned `""`.
 *
 * That empty string was a live hole. `actions/fishing.ts` puts the flavour
 * straight into `?notice=`, and `sanitizeFeedback` drops an empty notice —
 * so a spot with an empty flavour block let a player tap "Cast a line",
 * spend one of the day's casts, and see nothing whatsoever happen. The
 * foraging path was immune to exactly the same content mistake.
 *
 * The fallback is therefore non-empty by construction, and stated once.
 * It reads for both: a search that turned nothing up, and a cast that
 * caught nothing.
 */
export const NOTHING_FOUND_FALLBACK = "Nothing this time.";

export function pickFlavorLine(block: string): string {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return NOTHING_FOUND_FALLBACK;
  }
  return lines[secureQuantity(0, lines.length - 1)] as string;
}
