import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Request-board rate limits. Completion consumes items and grants coins,
 * so it is bounded like other economic mutations. The daily completion cap
 * is a separate, content-configured gameplay rule — this is only abuse
 * protection.
 */
const RULES = {
  "request-complete": { name: "request-complete", limit: 20, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type RequestRateLimitedOperation = keyof typeof RULES;

export async function enforceRequestRateLimit(
  db: DbClient,
  operation: RequestRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}
