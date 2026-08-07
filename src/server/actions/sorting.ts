"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import {
  dayView,
  startRun,
  submitBatch,
  type SortingDayView,
  type SortingRunView,
} from "@/server/modules/games/sorting/run";
import { sortingBatchSchema } from "@/lib/validation";
import { DomainError } from "@/server/errors";
import { correlationId, log } from "@/server/logging";
import { publicErrorMessage } from "./shared";

export interface SortingActionState {
  run: SortingRunView | null;
  day: SortingDayView | null;
  error: string | null;
  /** Coins this submission paid, serialized. Zero is the usual answer. */
  coinsAwarded: string;
  /** Increments per response so the client can detect a fresh one. */
  nonce: number;
}

/**
 * Starts a run. The response carries the board and a seven-find window;
 * the deck and its seed stay on the server.
 */
export async function startSortingRunAction(
  previous: SortingActionState,
): Promise<SortingActionState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;
  try {
    const run = await startRun(prisma, { userId: user.id });
    return {
      run,
      day: await dayView(prisma, { userId: user.id }),
      error: null,
      coinsAwarded: "0",
      nonce,
    };
  } catch (error) {
    return { ...failure(error, user.id, "sorting-start"), nonce };
  }
}

/**
 * Submits a batch of placements. The client sends shelf indices and the
 * index it believes it is at — never a board and never a score.
 */
export async function submitSortingBatchAction(
  previous: SortingActionState,
  formData: FormData,
): Promise<SortingActionState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;

  const parsed = sortingBatchSchema.safeParse({
    runId: formData.get("runId"),
    fromDrawIndex: formData.get("fromDrawIndex"),
    moves: formData.get("moves"),
  });
  if (!parsed.success) {
    return {
      run: previous.run,
      day: previous.day,
      error: "That doesn't look like a set of moves.",
      coinsAwarded: "0",
      nonce,
    };
  }

  try {
    const result = await submitBatch(prisma, {
      userId: user.id,
      runId: parsed.data.runId,
      fromDrawIndex: parsed.data.fromDrawIndex,
      moves: [...parsed.data.moves].map(Number),
    });
    if (result.coinsAwarded !== "0") {
      revalidatePath("/");
      revalidatePath("/history");
    }
    return {
      run: result.run,
      day: result.day,
      error: null,
      coinsAwarded: result.coinsAwarded,
      nonce,
    };
  } catch (error) {
    return { ...failure(error, user.id, "sorting-submit"), nonce };
  }
}

function failure(
  error: unknown,
  userId: string,
  op: string,
): Omit<SortingActionState, "nonce"> {
  if (!(error instanceof DomainError)) {
    log.error("action.failed", {
      correlationId: correlationId(),
      op,
      userId,
      error: error instanceof Error ? error.message.slice(0, 200) : String(error),
    });
  }
  return {
    run: null,
    day: null,
    error: publicErrorMessage(error),
    coinsAwarded: "0",
  };
}
