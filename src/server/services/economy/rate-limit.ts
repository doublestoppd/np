import type { PrismaClient } from "@prisma/client";
import { EconomyError } from "./errors";
import { RATE_LIMITS, type RateLimitedOperation } from "./config";
import { recordSecurityEvent } from "./audit";

/**
 * Fixed-window rate limiting backed by the database, so limits hold across
 * server instances. Throws RATE_LIMITED (generic public message — internal
 * thresholds are never exposed to clients) and records a security event
 * when a window is exceeded.
 */
export async function enforceRateLimit(
  db: PrismaClient,
  operation: RateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[operation];
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const key = `${operation}:${userId}`;

  const row = await db.rateLimitWindow.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (row.count > limit) {
    await recordSecurityEvent(db, {
      userId,
      type: "rate-limit-exceeded",
      severity: "warning",
      message: `Rate limit exceeded for ${operation}`,
      metadata: { operation, count: row.count, limit },
    });
    throw new EconomyError("RATE_LIMITED");
  }

  // Opportunistic cleanup of stale windows (cheap, best-effort).
  if (row.count === 1) {
    await db.rateLimitWindow
      .deleteMany({
        where: { key, windowStart: { lt: new Date(now.getTime() - 10 * windowMs) } },
      })
      .catch(() => undefined);
  }
}
