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
