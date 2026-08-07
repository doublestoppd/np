"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import {
  completeCurrentRequest,
  type RequestCompletionResult,
} from "@/server/modules/requests/complete";
import {
  skipCurrentRequest,
  type RequestSkipResult,
} from "@/server/modules/requests/skip";
import {
  getBoardView,
  type RequestBoardView,
} from "@/server/modules/requests/queries";
import { completeRequestSchema, skipRequestSchema } from "@/lib/validation";
import { DomainError } from "@/server/errors";
import { correlationId, log } from "@/server/logging";
import { publicErrorMessage } from "./shared";

/** What the last submission did, if it did anything. */
export type RequestBoardOutcome =
  | { kind: "completed"; completion: RequestCompletionResult }
  | { kind: "skipped"; skip: RequestSkipResult };

export interface RequestBoardActionState {
  outcome: RequestBoardOutcome | null;
  error: string | null;
  /**
   * The board as it stands after this submission, re-read from the
   * database. The board renders on a location page that `revalidatePath`
   * can't name from here, and both intents change which request is posted —
   * so the response carries the new one rather than leaving the player
   * looking at a list of ingredients for a request they no longer have.
   * Null only when the submission never reached the domain.
   */
  view: RequestBoardView | null;
  replayed: boolean;
  /** Increments per response so the client can detect a new result. */
  nonce: number;
}

export const initialRequestBoardState: RequestBoardActionState = {
  outcome: null,
  error: null,
  view: null,
  replayed: false,
  nonce: 0,
};

/**
 * The board's single submit endpoint. Both things a player can do here —
 * deliver the current request, or set it aside for the next one — move the
 * same progress row, so they share one action and therefore one
 * authoritative view of that row. Splitting them would give the client two
 * versions of the truth and let a stale one win.
 *
 * The client sends only the board key, the state token it rendered from, an
 * intent, and an idempotency key. Which request is current, what it costs,
 * and what it pays are all resolved server-side.
 */
export async function requestBoardAction(
  previous: RequestBoardActionState,
  formData: FormData,
): Promise<RequestBoardActionState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;
  const intent = formData.get("intent") === "skip" ? "skip" : "complete";

  const schema = intent === "skip" ? skipRequestSchema : completeRequestSchema;
  const parsed = schema.safeParse({
    boardKey: formData.get("boardKey"),
    expectedStateVersion: formData.get("expectedStateVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return {
      outcome: null,
      error: "Invalid request. Refresh and try again.",
      view: null,
      replayed: false,
      nonce,
    };
  }

  const params = {
    userId: user.id,
    boardKey: parsed.data.boardKey,
    expectedStateVersion: parsed.data.expectedStateVersion,
    idempotencyKey: parsed.data.idempotencyKey,
  };

  let outcome: RequestBoardOutcome;
  let replayed: boolean;
  try {
    if (intent === "skip") {
      const skipped = await skipCurrentRequest(prisma, params);
      outcome = { kind: "skipped", skip: skipped.result };
      replayed = skipped.replayed;
    } else {
      const completed = await completeCurrentRequest(prisma, params);
      outcome = { kind: "completed", completion: completed.result };
      replayed = completed.replayed;
      // Only a completion moves coins and items; the pages that show them
      // are ordinary routes this can name.
      revalidatePath("/inventory");
      revalidatePath("/history");
    }
    revalidatePath("/");
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log.error("action.failed", {
        correlationId: correlationId(),
        op: intent === "skip" ? "skip-request" : "complete-request",
        userId: user.id,
        error: error instanceof Error ? error.message.slice(0, 200) : String(error),
      });
    }
    // A conflict hands back the authoritative board so the next attempt can
    // succeed without a full page navigation.
    return {
      outcome: null,
      error: publicErrorMessage(error),
      view: await boardViewOrNull(user.id, params.boardKey),
      replayed: false,
      nonce,
    };
  }

  return {
    outcome,
    error: null,
    view: await boardViewOrNull(user.id, params.boardKey),
    replayed,
    nonce,
  };
}

/**
 * Re-reads the board for the response. A failure here must not turn a
 * committed completion into an error the player sees, so it degrades to
 * null and the client keeps rendering what it already had.
 */
async function boardViewOrNull(
  userId: string,
  boardKey: string,
): Promise<RequestBoardView | null> {
  try {
    return await getBoardView(prisma, { userId, boardKey });
  } catch (error) {
    log.error("action.failed", {
      correlationId: correlationId(),
      op: "request-board-refresh",
      userId,
      error: error instanceof Error ? error.message.slice(0, 200) : String(error),
    });
    return null;
  }
}
