"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import {
  completeCurrentRequest,
  type RequestCompletionResult,
} from "@/server/modules/requests/complete";
import { getBoardView } from "@/server/modules/requests/queries";
import { completeRequestSchema } from "@/lib/validation";
import { DomainError } from "@/server/errors";
import { correlationId, log } from "@/server/logging";
import { publicErrorMessage } from "./shared";

export interface CompleteRequestActionState {
  result: RequestCompletionResult | null;
  error: string | null;
  /** Authoritative state token to submit next; refreshed on conflicts. */
  stateVersion: number | null;
  replayed: boolean;
  /** Increments per response so the client can detect a new result. */
  nonce: number;
}

/**
 * Completes the viewer's current request. The client sends only the board
 * key, the state token it rendered from, and an idempotency key — which
 * request is current, what it costs, and what it pays are all resolved
 * server-side.
 */
export async function completeRequestAction(
  previous: CompleteRequestActionState,
  formData: FormData,
): Promise<CompleteRequestActionState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;

  const parsed = completeRequestSchema.safeParse({
    boardKey: formData.get("boardKey"),
    expectedStateVersion: formData.get("expectedStateVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return {
      result: null,
      error: "Invalid request. Refresh and try again.",
      stateVersion: null,
      replayed: false,
      nonce,
    };
  }

  try {
    const { result, replayed } = await completeCurrentRequest(prisma, {
      userId: user.id,
      boardKey: parsed.data.boardKey,
      expectedStateVersion: parsed.data.expectedStateVersion,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidatePath("/");
    revalidatePath("/inventory");
    revalidatePath("/history");
    return {
      result,
      error: null,
      stateVersion: result.stateVersion,
      replayed,
      nonce,
    };
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log.error("action.failed", {
        correlationId: correlationId(),
        op: "complete-request",
        userId: user.id,
        error: error instanceof Error ? error.message.slice(0, 200) : String(error),
      });
    }
    // A conflict hands back the authoritative version so the next attempt
    // can succeed without a full page navigation.
    const view = await getBoardView(prisma, {
      userId: user.id,
      boardKey: parsed.data.boardKey,
    });
    return {
      result: null,
      error: publicErrorMessage(error),
      stateVersion: view?.stateVersion ?? null,
      replayed: false,
      nonce,
    };
  }
}
