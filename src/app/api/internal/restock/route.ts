import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { runDueRestocks } from "@/server/modules/commerce/restocking/execute";
import { cronSecret } from "@/server/modules/commerce/config";
import { recordSecurityEventDeduplicated } from "@/server/security/audit";
import { cleanupRateLimitWindows } from "@/server/security/rate-limit";
import { cleanupIdempotencyKeys } from "@/server/security/idempotency";
import { cleanupSecurityEvents } from "@/server/security/audit";
import { log } from "@/server/logging";

/**
 * Internal scheduler endpoint (docs/operations.md): an external cron calls
 * POST /api/internal/restock with `Authorization: Bearer $CRON_SECRET`.
 * The restock service is idempotent per scheduled window, and shop pages
 * apply a non-blocking lazy fallback, so extra or missed calls are safe.
 * Piggybacks retention cleanup for rate-limit windows, idempotency
 * records, and old low-severity security events.
 *
 * The response never includes future scheduling information. Invalid auth
 * attempts are recorded with deduplication (one event per 10 minutes), so
 * a misconfigured probe cannot flood the audit table.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = cronSecret();
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    await recordSecurityEventDeduplicated(prisma, {
      type: "cron-auth-failure",
      severity: "warning",
      message: "Restock endpoint called without a valid bearer token",
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await runDueRestocks(prisma);
  const [rateWindows, idempotencyRows, securityRows] = await Promise.all([
    cleanupRateLimitWindows(prisma),
    cleanupIdempotencyKeys(prisma),
    cleanupSecurityEvents(prisma),
  ]);
  log.info("cron.restock", {
    shops: results.length,
    cleanedRateWindows: rateWindows,
    cleanedIdempotencyRows: idempotencyRows,
    cleanedSecurityEvents: securityRows,
  });
  return NextResponse.json({ shops: results });
}
