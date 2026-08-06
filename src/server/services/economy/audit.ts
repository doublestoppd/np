import type { Prisma, PrismaClient } from "@prisma/client";
import type { Tx } from "./idempotency";

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
 */
export async function recordSecurityEvent(
  db: PrismaClient | Tx,
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
 * Suspicious-activity signal: counts recent events of a type for a user and
 * records an escalation marker when the threshold is crossed. The marker is
 * the hook point for CAPTCHA or manual review — deliberately not wired to
 * an automatic block (docs/operations.md).
 */
export async function flagIfSuspicious(
  db: PrismaClient,
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
