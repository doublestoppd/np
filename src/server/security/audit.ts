import type { Prisma } from "@prisma/client";
import type { DbReader, DbClient } from "@/server/db";

export interface SecurityEventInput {
  userId?: string | null;
  type: string;
  severity?: "info" | "warning" | "critical";
  message: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Structured audit log for high-value and suspicious operations. Contents
 * are operator-facing only and must never be rendered to ordinary players.
 * Retention policy: docs/operations.md.
 */
export async function recordSecurityEvent(
  db: DbReader,
  event: SecurityEventInput,
): Promise<void> {
  await db.securityEvent.create({
    data: {
      userId: event.userId ?? null,
      type: event.type,
      severity: event.severity ?? "info",
      message: event.message,
      metadata: event.metadata,
    },
  });
}

/**
 * In-process record of when each event type last reached the database.
 * Unbounded growth is not a concern: keys are the fixed set of dedup'd
 * event type names, not per-request values.
 */
const lastRecordedByType = new Map<string, number>();

/**
 * Test seam: forget the in-process suppression window.
 *
 * Whether a deduplicated event reaches the database depends on what this
 * process did earlier, so a test asserting one was stored has to start
 * from a known window or it passes and fails by suite order.
 */
export function resetDeduplicationWindows(): void {
  lastRecordedByType.clear();
}

/**
 * Deduplicated recording for noisy *unauthenticated* failure classes (e.g.
 * invalid cron requests): at most one stored event per type per window.
 *
 * The in-process check comes first and is the point of this function. An
 * unauthenticated caller must not be able to make the server do database
 * work by repeating a request — a database round trip per rejected request
 * is itself the amplification such a caller is looking for. Once an event
 * of a type has been stored, further attempts within the window cost
 * nothing but a map lookup.
 *
 * The database check behind it is the cross-restart, cross-instance floor.
 * It is a read-then-insert and therefore racy, which is deliberate: the
 * failure mode is a small number of duplicate audit rows (at most one per
 * process per window), never a missed event or a lost mutation. Enforcing
 * it exactly would need a unique index on a rounded time bucket, and that
 * is not worth a schema constraint for a log line.
 */
export async function recordSecurityEventDeduplicated(
  db: DbClient,
  event: SecurityEventInput,
  windowMinutes = 10,
  now: Date = new Date(),
): Promise<void> {
  const windowMs = windowMinutes * 60_000;
  const suppressedUntil = lastRecordedByType.get(event.type);
  if (suppressedUntil !== undefined && now.getTime() < suppressedUntil) {
    return;
  }
  // Claim the window before awaiting, so concurrent rejected requests in
  // this process collapse into one database round trip rather than racing.
  lastRecordedByType.set(event.type, now.getTime() + windowMs);

  const since = new Date(now.getTime() - windowMs);
  const recent = await db.securityEvent.count({
    where: { type: event.type, createdAt: { gte: since } },
  });
  if (recent === 0) {
    await recordSecurityEvent(db, event);
  }
}

/**
 * Suspicious-activity signal: counts recent events of a type for a user and
 * records an escalation marker when the threshold is crossed. The marker is
 * the hook point for CAPTCHA or manual review — deliberately not wired to
 * an automatic block (docs/operations.md).
 */
export async function flagIfSuspicious(
  db: DbClient,
  {
    userId,
    type,
    threshold,
    windowMinutes,
  }: { userId: string; type: string; threshold: number; windowMinutes: number },
): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const count = await db.securityEvent.count({
    where: { userId, type, createdAt: { gte: since } },
  });
  if (count >= threshold) {
    await recordSecurityEvent(db, {
      userId,
      type: "escalation-suggested",
      severity: "warning",
      message: `User exceeded ${threshold} ${type} events in ${windowMinutes}m — consider CAPTCHA or review`,
      metadata: { sourceType: type, count, windowMinutes },
    });
    return true;
  }
  return false;
}

/**
 * Retention cleanup for security events.
 *
 * `warning` is swept as well as `info`, on a longer horizon. It was
 * previously exempt, which made every rate-limit rejection a permanent
 * row: an unauthenticated caller hammering sign-in could grow the table
 * without bound, which is precisely the amplification the rate limiter
 * exists to stop. `critical` is never swept — those are the rows an
 * operator goes looking for months later.
 */
export async function cleanupSecurityEvents(
  db: DbClient,
  now: Date = new Date(),
  maxAgeDays = 90,
  warningMaxAgeDays = 180,
): Promise<number> {
  const [info, warning] = await Promise.all([
    db.securityEvent.deleteMany({
      where: {
        severity: "info",
        createdAt: { lt: new Date(now.getTime() - maxAgeDays * 86_400_000) },
      },
    }),
    db.securityEvent.deleteMany({
      where: {
        severity: "warning",
        createdAt: {
          lt: new Date(now.getTime() - warningMaxAgeDays * 86_400_000),
        },
      },
    }),
  ]);
  return info.count + warning.count;
}
