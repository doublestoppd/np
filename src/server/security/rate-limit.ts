import type { DbClient } from "@/server/db";
import { DomainError } from "@/server/errors";
import { recordSecurityEventDeduplicated } from "./audit";

/**
 * Sliding-window rate limiting backed by the database, so limits hold
 * across server instances. Reusable by commerce, authentication, and future
 * social systems; feature modules own their own limit tables/config.
 * Thresholds are never exposed to clients.
 *
 * The window slides rather than snapping to epoch boundaries. A plain
 * fixed window lets an attacker fire the full limit at the end of one
 * bucket and the full limit again at the start of the next — twice the
 * limit in a couple of seconds across the seam. That is the difference
 * between "10 sign-in attempts per 5 minutes" and "20 in one burst," which
 * matters on the auth paths. The estimate below counts the current bucket
 * plus the fraction of the previous bucket still inside a rolling window,
 * so any `windowSeconds` interval is bounded to roughly `limit`. Within a
 * single window, with no previous bucket, it is identical to the fixed
 * window it replaced.
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
      // Refused before anything ran, so nothing was taken — worth saying
      // on the purchase paths this also guards.
      "Take a breath — you're going a little fast. Nothing was taken; try again shortly.",
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
  const currentStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const previousStart = new Date(currentStart.getTime() - windowMs);
  const key = `${rule.name}:${subject}`;

  // This request is counted before it is judged, so a refused request
  // still consumes a slot — the same as the fixed window, and what stops a
  // caller from staying pinned just under the ceiling forever.
  const row = await db.rateLimitWindow.upsert({
    where: { key_windowStart: { key, windowStart: currentStart } },
    create: { key, windowStart: currentStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  // The previous bucket's weight decays from 1 at the seam to 0 a full
  // window later, so the rolling estimate never counts a request that has
  // aged out. No previous bucket → weight contributes nothing → identical
  // to the fixed window.
  const previous = await db.rateLimitWindow.findUnique({
    where: { key_windowStart: { key, windowStart: previousStart } },
    select: { count: true },
  });
  const elapsed = now.getTime() - currentStart.getTime();
  const weight = Math.max(0, (windowMs - elapsed) / windowMs);
  const estimated = row.count + (previous?.count ?? 0) * weight;

  if (estimated > rule.limit) {
    // Deduplicated per rule, not recorded per rejection. A rejected
    // request must not cost MORE database work than an accepted one, or
    // the limiter becomes the amplifier: an unauthenticated caller
    // hammering sign-in wrote a permanent audit row per attempt. The
    // in-process window collapses the rest into a map lookup, and the
    // event is a signal that a rule is being hit — the count is in the
    // RateLimitWindow row, which is swept.
    await recordSecurityEventDeduplicated(db, {
      userId: userId ?? null,
      type: `rate-limit-exceeded:${rule.name}`,
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
