"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import {
  currentRun,
  dayView,
  flipCard,
  startRun,
  type MatchingDayView,
  type MatchingRunView,
} from "@/server/modules/games/matching/run";
import { matchingFlipSchema, matchingStartSchema } from "@/lib/validation";
import { DomainError } from "@/server/errors";
import { correlationId, log } from "@/server/logging";
import { publicErrorMessage } from "./shared";

export interface MatchingActionState {
  run: MatchingRunView | null;
  day: MatchingDayView | null;
  error: string | null;
  /** Coins this flip paid, serialized. Zero is the usual answer. */
  coinsAwarded: string;
  /** True when a finish was unpaid because the day's payout was taken. */
  alreadyPaidToday: boolean;
  /** Increments per response so the client can detect a fresh one. */
  nonce: number;
}

/** Sets a fresh table. The layout and its seed stay on the server. */
export async function startMatchingRunAction(
  previous: MatchingActionState,
  formData: FormData,
): Promise<MatchingActionState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;
  const parsed = matchingStartSchema.safeParse({
    difficulty: formData.get("difficulty"),
  });
  if (!parsed.success) {
    return { ...previous, error: "Invalid request.", nonce };
  }
  try {
    const run = await startRun(prisma, {
      userId: user.id,
      difficulty: parsed.data.difficulty,
    });
    return {
      run,
      day: await dayView(prisma, { userId: user.id }),
      error: null,
      coinsAwarded: "0",
      alreadyPaidToday: false,
      nonce,
    };
  } catch (error) {
    return { ...failure(previous, error, user.id, "matching-start"), nonce };
  }
}

/**
 * Turns one stone. The client sends a card index and nothing else — never
 * a face, never a match, never a score.
 */
export async function flipMatchingCardAction(
  previous: MatchingActionState,
  formData: FormData,
): Promise<MatchingActionState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;
  const parsed = matchingFlipSchema.safeParse({
    runId: formData.get("runId"),
    card: formData.get("card"),
  });
  if (!parsed.success) {
    return { ...previous, error: "Invalid request.", nonce };
  }
  try {
    const { view, coinsAwarded, alreadyPaidToday } = await flipCard(prisma, {
      userId: user.id,
      runId: parsed.data.runId,
      card: parsed.data.card,
    });
    if (view.status === "COMPLETED") {
      revalidatePath("/");
      revalidatePath("/history");
    }
    return {
      run: view,
      day: await dayView(prisma, { userId: user.id }),
      error: null,
      coinsAwarded,
      alreadyPaidToday,
      nonce,
    };
  } catch (error) {
    // A voided or exhausted run must not leave a stale board on screen,
    // so the state is refreshed from the server rather than kept.
    const refreshed = previous.run
      ? await currentRun(prisma, {
          userId: user.id,
          difficulty: previous.run.difficulty,
        })
      : null;
    return {
      ...failure(previous, error, user.id, "matching-flip"),
      run: refreshed,
      nonce,
    };
  }
}

function failure(
  previous: MatchingActionState,
  error: unknown,
  userId: string,
  op: string,
): MatchingActionState {
  if (!(error instanceof DomainError)) {
    log.error("action.failed", {
      op,
      userId,
      correlationId: correlationId(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return {
    ...previous,
    error: publicErrorMessage(error),
    coinsAwarded: "0",
    alreadyPaidToday: false,
  };
}
