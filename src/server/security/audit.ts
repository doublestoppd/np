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
 * Deduplicated recording for noisy unauthenticated failure classes (e.g.
 * invalid cron requests): at most one stored event per type per window.
 */
export async function recordSecurityEventDeduplicated(
  db: DbClient,
  event: SecurityEventInput,
  windowMinutes = 10,
  now: Date = new Date(),
): Promise<void> {
  const since = new Date(now.getTime() - windowMinutes * 60_000);
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

/** Retention cleanup for old low-severity security events. */
export async function cleanupSecurityEvents(
  db: DbClient,
  now: Date = new Date(),
  maxAgeDays = 90,
): Promise<number> {
  const result = await db.securityEvent.deleteMany({
    where: {
      severity: "info",
      createdAt: { lt: new Date(now.getTime() - maxAgeDays * 86_400_000) },
    },
  });
  return result.count;
}
