import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { runDueRestocks } from "@/server/modules/commerce/restocking/execute";
import { cronSecret } from "@/server/modules/commerce/config";
import { ensureDailyPuzzles } from "@/server/modules/daily/word/puzzles";
import { addGameDays, currentGameDate } from "@/server/modules/daily/game-day";
import { recordSecurityEventDeduplicated } from "@/server/security/audit";
import { cleanupRateLimitWindows } from "@/server/security/rate-limit";
import { cleanupIdempotencyKeys } from "@/server/security/idempotency";
import { cleanupSecurityEvents } from "@/server/security/audit";
import { cleanupSessions } from "@/server/auth/session";
import { log } from "@/server/logging";

/**
 * Internal scheduler endpoint (docs/operations.md): an external cron calls
 * POST /api/internal/restock with `Authorization: Bearer $CRON_SECRET`.
 * The restock service is idempotent per scheduled window, and shop pages
 * apply a non-blocking lazy fallback, so extra or missed calls are safe.
 * Also pre-generates today's and tomorrow's daily word puzzles (idempotent;
 * guess submission has its own lazy fallback) and piggybacks retention
 * cleanup for rate-limit windows, idempotency records, expired sessions,
 * and old low-severity security events.
 *
 * The response never includes future scheduling information, puzzle
 * answers, or word data. The token is compared in constant time, and
 * invalid auth attempts are recorded with deduplication (one event per 10
 * minutes, gated in-process first), so an unauthenticated caller can
 * neither flood the audit table nor turn a rejected request into database
 * work.
 */
/**
 * Constant-time bearer comparison. `===` on strings short-circuits at the
 * first differing byte, which leaks the shared secret one character at a
 * time to a caller who can measure response times.
 */
function matchesBearer(header: string | null, secret: string): boolean {
  if (header === null) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(header, "utf8");
  // timingSafeEqual requires equal lengths; length alone is not a secret.
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = cronSecret();
  const header = request.headers.get("authorization");
  if (!secret || !matchesBearer(header, secret)) {
    await recordSecurityEventDeduplicated(prisma, {
      type: "cron-auth-failure",
      severity: "warning",
      message: "Restock endpoint called without a valid bearer token",
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await runDueRestocks(prisma);

  // Daily word puzzles: create today's (if the lazy path hasn't already)
  // and pre-generate tomorrow's so the midnight rollover never waits.
  const today = currentGameDate();
  let puzzlesReady = 0;
  let puzzleError: string | null = null;
  try {
    puzzlesReady += (await ensureDailyPuzzles(prisma, today)).length;
    puzzlesReady += (await ensureDailyPuzzles(prisma, addGameDays(today, 1)))
      .length;
  } catch (error) {
    // Missing puzzles are an operator alert, not a restock failure.
    puzzleError = error instanceof Error ? error.message.slice(0, 120) : "error";
    log.error("cron.puzzle-generation-failed", { error: puzzleError });
  }

  const [rateWindows, idempotencyRows, securityRows, expiredSessions] =
    await Promise.all([
      cleanupRateLimitWindows(prisma),
      cleanupIdempotencyKeys(prisma),
      cleanupSecurityEvents(prisma),
      cleanupSessions(prisma),
    ]);
  log.info("cron.restock", {
    shops: results.length,
    puzzlesReady,
    puzzleError,
    cleanedRateWindows: rateWindows,
    cleanedIdempotencyRows: idempotencyRows,
    cleanedSecurityEvents: securityRows,
    cleanedSessions: expiredSessions,
  });
  return NextResponse.json({
    shops: results,
    puzzles: { ready: puzzlesReady, error: puzzleError !== null },
  });
}
