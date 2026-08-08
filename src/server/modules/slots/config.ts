import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/** Active prize weights on a token tier are basis points summing to this. */
export const SLOT_TOTAL_WEIGHT = 10_000;

/** The counter beside the machine. */
export const TUMBLEHOUSE_SHOP_SLUG = "tumblehouse-counter";

/**
 * The drums have no seeded configuration — the tiers and their tables are
 * content, but the machine itself is code, so there is exactly one of it
 * and its key is fixed. Validated offline: a second attachment would be a
 * second machine that shares one set of tokens and one set of tables,
 * which is not a thing anybody means to author.
 */
export const SLOT_MACHINE_ACTIVITY_KEY = "tumblehouse-drums";

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
