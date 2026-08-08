"use server";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { spinDrums, type SlotOutcome } from "@/server/modules/slots/spin";
import { slotSpinSchema } from "@/lib/validation";
import { DomainError } from "@/server/errors";
import { correlationId, log } from "@/server/logging";
import { publicErrorMessage } from "./shared";

export interface SlotActionState {
  /** The settled outcome, including where the drums stopped. */
  outcome: SlotOutcome | null;
  error: string | null;
  replayed: boolean;
  /** Increments per response so the machine can tell a fresh pull from a stale one. */
  nonce: number;
}

/**
 * Works the lever once and returns the result rather than redirecting.
 *
 * A redirect would throw away the drums: the whole pull is decided in one
 * call, and the machine needs the three faces in hand to stop them one at
 * a time.
 *
 * It deliberately does NOT revalidate, for the reason the chit action
 * records: revalidating re-renders the tree that owns the machine, and
 * the animation would be cut off mid-spin every time. The page refreshes
 * when the player is done, which is also when they want to see the new
 * balance.
 */
export async function spinSlotsAction(
  previous: SlotActionState,
  formData: FormData,
): Promise<SlotActionState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;

  const parsed = slotSpinSchema.safeParse({
    itemId: formData.get("itemId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return { ...previous, error: "Invalid request.", nonce };
  }

  try {
    const { outcome, replayed } = await spinDrums(prisma, {
      userId: user.id,
      itemId: parsed.data.itemId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return { outcome, error: null, replayed, nonce };
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log.error("action.failed", {
        op: "slot-spin",
        userId: user.id,
        correlationId: correlationId(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { outcome: null, error: publicErrorMessage(error), replayed: false, nonce };
  }
}
