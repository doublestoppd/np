import type { DbClient } from "@/server/db";
import { DomainError } from "@/server/errors";
import { recordSecurityEvent } from "./audit";

/**
 * Generic fixed-window rate limiting backed by the database, so limits hold
 * across server instances. Reusable by commerce, authentication, and future
 * social systems; feature modules own their own limit tables/config.
 * Thresholds are never exposed to clients.
 */

export interface RateLimitRule {
  /** Stable key prefix, e.g. "npc-purchase" or "auth:sign-in". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export class RateLimitedError extends DomainError {
  constructor() {
    super(
      "RATE_LIMITED",
      "Take a breath — you're going a little fast. Try again shortly.",
    );
    this.name = "RateLimitedError";
  }
}

/**
 * Consumes one unit from the subject's window and throws RateLimitedError
 * when over the limit, recording a security event. `subject` is typically a
 * user id or hashed origin.
 */
export async function enforceRateLimit(
  db: DbClient,
  rule: RateLimitRule,
  subject: string,
  { userId, now = new Date() }: { userId?: string; now?: Date } = {},
): Promise<void> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const key = `${rule.name}:${subject}`;

  const row = await db.rateLimitWindow.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (row.count > rule.limit) {
    await recordSecurityEvent(db, {
      userId: userId ?? null,
      type: "rate-limit-exceeded",
      severity: "warning",
      message: `Rate limit exceeded for ${rule.name}`,
      metadata: { rule: rule.name, count: row.count, limit: rule.limit },
    });
    throw new RateLimitedError();
  }

  // Opportunistic cleanup of this key's stale windows (cheap, best-effort).
  if (row.count === 1) {
    await db.rateLimitWindow
      .deleteMany({
        where: { key, windowStart: { lt: new Date(now.getTime() - 10 * windowMs) } },
      })
      .catch(() => undefined);
  }
}

/**
 * Global cleanup for expired rate-limit windows; run opportunistically from
 * the cron endpoint (docs/operations.md documents retention).
 */
export async function cleanupRateLimitWindows(
  db: DbClient,
  now: Date = new Date(),
  maxAgeMs: number = 24 * 3_600_000,
): Promise<number> {
  const result = await db.rateLimitWindow.deleteMany({
    where: { windowStart: { lt: new Date(now.getTime() - maxAgeMs) } },
  });
  return result.count;
}
