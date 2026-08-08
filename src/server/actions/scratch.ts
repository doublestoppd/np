"use server";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import {
  scratchCard,
  type ScratchOutcome,
} from "@/server/modules/scratch/scratch";
import { scratchCardSchema } from "@/lib/validation";
import { DomainError } from "@/server/errors";
import { correlationId, log } from "@/server/logging";
import { publicErrorMessage } from "./shared";

export interface ScratchActionState {
  /** The settled outcome, including the three marks. Null before a scratch. */
  outcome: ScratchOutcome | null;
  error: string | null;
  replayed: boolean;
  /** Increments per response so the dialog can tell a fresh chit from a stale one. */
  nonce: number;
}

/**
 * Scratches one chit and returns the result rather than redirecting.
 *
 * A redirect would throw away the reveal: the whole card is decided in one
 * call, and the dialog needs the three marks in hand to uncover them one
 * at a time.
 *
 * It deliberately does NOT revalidate. Revalidating re-renders the tree
 * that owns the dialog, and a native `<dialog>` does not survive being
 * remounted — the first version of this closed the card the instant it
 * was scratched. The satchel refreshes when the player closes the dialog
 * instead, which is also when they want to see the new counts.
 */
export async function scratchCardAction(
  previous: ScratchActionState,
  formData: FormData,
): Promise<ScratchActionState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;

  const parsed = scratchCardSchema.safeParse({
    itemId: formData.get("itemId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return { ...previous, error: "Invalid request.", nonce };
  }

  try {
    const { outcome, replayed } = await scratchCard(prisma, {
      userId: user.id,
      itemId: parsed.data.itemId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return { outcome, error: null, replayed, nonce };
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log.error("action.failed", {
        op: "scratch-card",
        userId: user.id,
        correlationId: correlationId(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return {
      outcome: null,
      error: publicErrorMessage(error),
      replayed: false,
      nonce,
    };
  }
}
