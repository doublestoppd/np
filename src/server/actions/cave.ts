"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import {
  beginDelve,
  chooseDoor,
  type CaveDelveView,
  type CaveStepView,
} from "@/server/modules/cave/delve";
import { caveChoiceSchema } from "@/lib/validation";
import { DomainError } from "@/server/errors";
import { correlationId, log } from "@/server/logging";
import { publicErrorMessage } from "./shared";

/**
 * The Sunken Stair, in one action state.
 *
 * Deliberately NOT a redirect-with-notice like the lantern: a descent is a
 * sequence of moments and each one has something to say, so the response
 * carries the whole delve as it now stands and the page repaints in place.
 * A full navigation per room would lose the step that just happened.
 */
export interface CaveActionState {
  view: CaveDelveView | null;
  /** The step just taken, for the reveal. Null on a begin or a failure. */
  step: CaveStepView | null;
  error: string | null;
  coinsAwarded: string;
  prizeName: string | null;
  /** Increments per response so the client can tell a fresh one. */
  nonce: number;
}

export async function beginDelveAction(
  previous: CaveActionState,
): Promise<CaveActionState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;
  try {
    const view = await beginDelve(prisma, { userId: user.id });
    return { view, step: null, error: null, coinsAwarded: "0", prizeName: null, nonce };
  } catch (error) {
    return { ...failure(previous, error, user.id, "cave-begin"), nonce };
  }
}

/**
 * Opens a door.
 *
 * Revalidates only when the descent ENDS. A cache pays coins mid-descent
 * and the wallet chip in the shell is server-rendered, so it would go
 * stale — but revalidating on every room would re-render the page under a
 * player mid-choice, which is the exact thing the slate's action avoids.
 * The response carries the running total, and the shell catches up when
 * the run is over.
 */
export async function chooseDoorAction(
  previous: CaveActionState,
  formData: FormData,
): Promise<CaveActionState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;
  const parsed = caveChoiceSchema.safeParse({
    depth: formData.get("depth"),
    door: formData.get("door"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return { ...previous, step: null, error: "That isn't a door.", nonce };
  }

  try {
    const { result } = await chooseDoor(prisma, {
      userId: user.id,
      depth: parsed.data.depth,
      door: parsed.data.door === 1 ? 1 : 0,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    if (result.view.status !== "IN_PROGRESS") {
      revalidatePath("/");
      revalidatePath("/activities");
      revalidatePath("/history");
      revalidatePath("/inventory");
    }
    return {
      view: result.view,
      step: result.step,
      error: null,
      coinsAwarded: result.coinsAwarded,
      prizeName: result.prizeName,
      nonce,
    };
  } catch (error) {
    return { ...failure(previous, error, user.id, "cave-choose"), nonce };
  }
}

function failure(
  previous: CaveActionState,
  error: unknown,
  userId: string,
  op: string,
): CaveActionState {
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
    step: null,
    error: publicErrorMessage(error),
    coinsAwarded: "0",
    prizeName: null,
  };
}
