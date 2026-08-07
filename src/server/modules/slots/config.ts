import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/** Active prize weights on a token tier are basis points summing to this. */
export const SLOT_TOTAL_WEIGHT = 10_000;

/** The one machine, in a shed in the salt flats. */
export const TUMBLEHOUSE_SHOP_SLUG = "tumblehouse-counter";

const RULES = {
  spin: { name: "slot-spin", limit: 30, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

/**
 * A ceiling on pulls per minute, not per day.
 *
 * Deliberately not a daily cap, for the reason the chits give: a daily cap
 * on a thing you already paid for is a second price. This exists only to
 * bound automation and sits well above what a person can physically tap —
 * and well above the animation, which takes about two seconds to settle.
 */
export async function enforceSlotRateLimit(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES.spin, userId, { userId, now });
}
