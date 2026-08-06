import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { runDueRestocks } from "@/server/services/economy/restock";
import { cronSecret } from "@/server/services/economy/config";
import { recordSecurityEvent } from "@/server/services/economy/audit";

/**
 * Internal scheduler endpoint (docs/operations.md): an external cron calls
 * POST /api/internal/restock with `Authorization: Bearer $CRON_SECRET`
 * on a cadence at least as frequent as the shortest shop interval. The
 * restock service is idempotent per scheduled window, and shop pages apply
 * a lazy fallback, so extra or missed calls are safe.
 *
 * The response never includes future scheduling information.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = cronSecret();
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    await recordSecurityEvent(prisma, {
      type: "cron-auth-failure",
      severity: "warning",
      message: "Restock endpoint called without a valid bearer token",
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await runDueRestocks(prisma);
  return NextResponse.json({ shops: results });
}
