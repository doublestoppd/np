"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import {
  claimRun,
  startRun,
  submitRun,
} from "@/server/modules/games/arcade/run";
import {
  arcadeClaimSchema,
  arcadeStartSchema,
  arcadeSubmitSchema,
} from "@/lib/validation";
import { correlationId, log } from "@/server/logging";
import { DomainError } from "@/server/errors";
import { publicErrorMessage } from "./shared";

/**
 * The arcade games, in one action state (ADR-62).
 *
 * Not a redirect-with-notice: a run ends inside a canvas and the result
 * belongs beside it, not on a fresh page load that would throw the stage
 * away. The response carries what the SERVER decided — the score it
 * derived, the coins that score is worth — and the client shows that
 * rather than the number it was displaying a moment ago. Those two agree
 * on every honest run, and when they do not, the server is right.
 *
 * Three actions, because ending a run and being paid for it are different
 * events with a decision in between (ADR-64): start, submit (scores,
 * records, pays nothing) and claim (the player choosing to bank it).
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
  /** The run the offer below belongs to, for the claim that may follow. */
  runId: string | null;
  /** Exactly what taking it would pay. Nothing has been paid yet. */
  coinsOffered: string;
  claimable: boolean;
  claimsUsed: number;
  personalBest: boolean;
  error: string | null;
  nonce: number;
}

export interface ArcadeClaimState {
  coinsAwarded: string;
  claimsUsed: number;
  /** The run that was taken, so the offer for it can be retired. */
  runId: string | null;
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
    runId: null,
    coinsOffered: "0",
    claimable: false,
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
    // No revalidate here: scoring pays nothing, so no coin balance or
    // header figure has moved. The claim below is what changes the wallet.
    return {
      score: result.score,
      runId: parsed.data.runId,
      coinsOffered: result.coinsOffered,
      claimable: result.claimable,
      claimsUsed: result.claimsUsed,
      personalBest: result.personalBest,
      error: null,
      nonce,
    };
  } catch (error) {
    return { ...empty, error: report(error, user.id, "arcade-submit"), nonce };
  }
}

/**
 * Takes the coins for a run the player has decided to keep (ADR-64).
 *
 * Separate from submitting on purpose: submitting is what the game does
 * when a run ends, and this is what the PLAYER does about it.
 */
export async function claimArcadeRunAction(
  previous: ArcadeClaimState,
  formData: FormData,
): Promise<ArcadeClaimState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;
  const empty = {
    coinsAwarded: "0",
    claimsUsed: previous.claimsUsed,
    runId: null,
  };

  const parsed = arcadeClaimSchema.safeParse({
    runId: formData.get("runId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return { ...empty, error: "Invalid request.", nonce };
  }

  try {
    const { result } = await claimRun(prisma, {
      userId: user.id,
      runId: parsed.data.runId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidatePath("/");
    return {
      coinsAwarded: result.coinsAwarded,
      claimsUsed: result.claimsUsed,
      runId: parsed.data.runId,
      error: null,
      nonce,
    };
  } catch (error) {
    return { ...empty, error: report(error, user.id, "arcade-claim"), nonce };
  }
}

/** Domain errors are expected outcomes; anything else is logged in full. */
function report(error: unknown, userId: string, op: string): string {
  if (!(error instanceof DomainError)) {
    log.error("action.failed", {
      correlationId: correlationId(),
      op,
      userId,
      error:
        error instanceof Error ? error.message.slice(0, 200) : String(error),
    });
  }
  return publicErrorMessage(error);
}
