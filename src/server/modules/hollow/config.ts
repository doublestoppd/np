import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Sizes from smallest to largest. This is a rendering contract — what fits
 * where — and never a rank: an anchor holds anything at or under its own
 * size, and no view ever orders furnishings by it.
 */
export const SIZE_ORDER = ["SMALL", "MEDIUM", "LARGE", "CENTREPIECE"] as const;
export type FurnishingSizeKey = (typeof SIZE_ORDER)[number];

export function sizeFits(size: string, maxSize: string): boolean {
  const at = SIZE_ORDER.indexOf(size as FurnishingSizeKey);
  const cap = SIZE_ORDER.indexOf(maxSize as FurnishingSizeKey);
  return at >= 0 && cap >= 0 && at <= cap;
}

/**
 * Longest caption a player may write under one of their grounds. One
 * declaration, in the client-safe module, shared with the Zod schema.
 */
export { HOLLOW_CAPTION_MAX as CAPTION_MAX } from "@/lib/validation";

/**
 * How many growth steps a growing furnishing passes through, including the
 * one it arrives at. Three is enough to read as change and few enough that
 * every step can be painted.
 */
export const GROWTH_STAGES = 3;

/**
 * How far along a growing furnishing is: 0 the day it is set down, and
 * GROWTH_STAGES - 1 once it is finished.
 *
 * Derived from a timestamp on read, exactly as pet needs are — nothing
 * ticks, nothing has to be watered, and a player who is away for a month
 * comes back to a taller tree rather than a dead one.
 */
export function growthStage(
  plantedAt: Date,
  growthDays: number | null,
  now: Date,
): number {
  if (growthDays === null || growthDays <= 0) {
    return GROWTH_STAGES - 1;
  }
  const days = (now.getTime() - plantedAt.getTime()) / 86_400_000;
  const fraction = Math.max(0, Math.min(1, days / growthDays));
  return Math.min(GROWTH_STAGES - 1, Math.floor(fraction * GROWTH_STAGES));
}

/**
 * Rate limits. Arranging moves no coins, but it is still a locked
 * read-modify-write of a whole scene, which is worth bounding on its own
 * (docs/conventions.md). Arranging is fiddly and people do it in bursts,
 * so its limit is generous; buying is not.
 */
const RULES = {
  "hollow-arrange": { name: "hollow-arrange", limit: 60, windowSeconds: 60 },
  "hollow-purchase": { name: "hollow-purchase", limit: 20, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type HollowRateLimitedOperation = keyof typeof RULES;

export async function enforceHollowRateLimit(
  db: DbClient,
  operation: HollowRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}
