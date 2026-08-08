"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { startRun, submitRun } from "@/server/modules/games/arcade/run";
import { arcadeStartSchema, arcadeSubmitSchema } from "@/lib/validation";
import { correlationId, log } from "@/server/logging";
import { DomainError } from "@/server/errors";
import { publicErrorMessage } from "./shared";

/**
 * The arcade games, in one action state (ADR-62).
 *
 * Not a redirect-with-notice: a run ends inside a canvas and the result
 * belongs beside it, not on a fresh page load that would throw the stage
 * away. The response carries what the SERVER decided — the score it
 * derived, the coins it paid — and the client shows that rather than the
 * number it was displaying a moment ago. Those two agree on every honest
 * run, and when they do not, the server is right.
 */

export interface ArcadeStartState {
  runId: string | null;
  seed: string | null;
  error: string | null;
  nonce: number;
}

export interface ArcadeSubmitState {
  /** The score the server derived by replaying the trace. */
  score: number | null;
  coinsAwarded: string;
  unpaid: boolean;
  claimsUsed: number;
  personalBest: boolean;
  error: string | null;
  nonce: number;
}

export async function startArcadeRunAction(
  previous: ArcadeStartState,
  formData: FormData,
): Promise<ArcadeStartState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;

  const parsed = arcadeStartSchema.safeParse({ game: formData.get("game") });
  if (!parsed.success) {
    return { runId: null, seed: null, error: "Invalid request.", nonce };
  }

  try {
    const run = await startRun(prisma, {
      userId: user.id,
      game: parsed.data.game,
    });
    return { runId: run.runId, seed: run.seed, error: null, nonce };
  } catch (error) {
    return {
      runId: null,
      seed: null,
      error: report(error, user.id, "arcade-start"),
      nonce,
    };
  }
}

export async function submitArcadeRunAction(
  previous: ArcadeSubmitState,
  formData: FormData,
): Promise<ArcadeSubmitState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;
  const empty = {
    score: null,
    coinsAwarded: "0",
    unpaid: false,
    claimsUsed: previous.claimsUsed,
    personalBest: false,
  };

  const parsed = arcadeSubmitSchema.safeParse({
    runId: formData.get("runId"),
    trace: formData.get("trace"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return { ...empty, error: "Invalid request.", nonce };
  }

  try {
    const { result } = await submitRun(prisma, {
      userId: user.id,
      runId: parsed.data.runId,
      trace: parsed.data.trace,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidatePath("/");
    return {
      score: result.score,
      coinsAwarded: result.coinsAwarded,
      unpaid: result.unpaid,
      claimsUsed: result.claimsUsed,
      personalBest: result.personalBest,
      error: null,
      nonce,
    };
  } catch (error) {
    return { ...empty, error: report(error, user.id, "arcade-submit"), nonce };
  }
}

/** Domain errors are expected outcomes; anything else is logged in full. */
function report(error: unknown, userId: string, op: string): string {
  if (!(error instanceof DomainError)) {
    log.error("action.failed", {
      correlationId: correlationId(),
      op,
      userId,
      error: error instanceof Error ? error.message.slice(0, 200) : String(error),
    });
  }
  return publicErrorMessage(error);
}
