"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { log } from "@/server/logging";
import {
  submitGuess,
  type GuessSubmissionResult,
} from "@/server/modules/daily/word/game";
import { spinWheel, type SpinOutcome } from "@/server/modules/daily/wheel/spin";
import { claimDailyMeal, WARMING_HUT_POOL_SLUG } from "@/server/modules/daily/food/claim";
import {
  dailyLocationPath,
  MEAL_LOCATION_SLUG,
  DRINK_LOCATION_SLUG,
  DRINK_REGION_SLUG,
  WORD_LOCATION_SLUG,
} from "@/server/modules/daily/locations";
import {
  dailyMealSchema,
  dailySpinSchema,
  wordGuessSchema,
} from "@/lib/validation";
import { failWith, publicErrorMessage, succeedWith, isRedirectError } from "./shared";

/**
 * Daily-activity actions. The word and wheel actions return state for
 * interactive client components (useActionState) instead of redirecting;
 * the meal claim follows the standard redirect+notice pattern. Every
 * mutation requires the session user and an idempotency key; the domain
 * layer owns game dates, attempt counts, rewards, and randomness.
 */

function revalidateDaily(locationSlug: string, regionSlug?: string): void {
  // Both directories of "what there is to do today" read live state.
  revalidatePath("/");
  revalidatePath("/games");
  revalidatePath(dailyLocationPath(locationSlug, regionSlug));
  revalidatePath("/inventory");
  revalidatePath("/history/daily");
}

export interface WordGuessActionState {
  result: GuessSubmissionResult | null;
  error: string | null;
  /** Monotonic marker so the client can tell fresh responses apart. */
  nonce: number;
}

export async function submitWordGuessAction(
  previous: WordGuessActionState,
  formData: FormData,
): Promise<WordGuessActionState> {
  const user = await requireUser();
  const parsed = wordGuessSchema.safeParse({
    difficulty: formData.get("difficulty"),
    guess: formData.get("guess"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return {
      result: previous.result,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
      nonce: previous.nonce + 1,
    };
  }
  try {
    const result = await submitGuess(prisma, {
      userId: user.id,
      difficulty: parsed.data.difficulty,
      guess: parsed.data.guess,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateDaily(WORD_LOCATION_SLUG);
    return { result, error: null, nonce: previous.nonce + 1 };
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log.error("daily-word.action-error", {
        userId: user.id,
        message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
    }
    return {
      result: previous.result,
      error: publicErrorMessage(error),
      nonce: previous.nonce + 1,
    };
  }
}

export interface SpinActionState {
  outcome: SpinOutcome | null;
  error: string | null;
  nonce: number;
}

export async function spinWheelAction(
  previous: SpinActionState,
  formData: FormData,
): Promise<SpinActionState> {
  const user = await requireUser();
  const parsed = dailySpinSchema.safeParse({
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return {
      outcome: previous.outcome,
      error: "Invalid request. Refresh and try again.",
      nonce: previous.nonce + 1,
    };
  }
  try {
    const outcome = await spinWheel(prisma, {
      userId: user.id,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    // Deliberately NOT revalidating the wheel's own location page: a
    // router refresh mid-animation would re-render the spinning wheel.
    // The client already holds the outcome; the page's server view shows
    // the recorded spin on the next visit.
    revalidatePath("/");
    revalidatePath("/inventory");
    revalidatePath("/history/daily");
    return { outcome, error: null, nonce: previous.nonce + 1 };
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log.error("daily-wheel.action-error", {
        userId: user.id,
        message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
    }
    return {
      outcome: previous.outcome,
      error: publicErrorMessage(error),
      nonce: previous.nonce + 1,
    };
  }
}

export async function claimMealAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = dailyLocationPath(MEAL_LOCATION_SLUG);
  const parsed = dailyMealSchema.safeParse({
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    failWith(returnTo, new DomainError("INVALID_INPUT", "Invalid request. Refresh and try again."));
  }
  try {
    const result = await claimDailyMeal(prisma, {
      userId: user.id,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateDaily(MEAL_LOCATION_SLUG);
    succeedWith(
      returnTo,
      result.alreadyClaimed
        ? `Today's meal was already served: ${result.itemName}.`
        : `Enjoy! You received ${result.itemName}.`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    if (!(error instanceof DomainError)) {
      log.error("daily-food.action-error", {
        userId: user.id,
        message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
    }
    failWith(returnTo, error, { op: "claim-meal", userId: user.id });
  }
}

/**
 * Claims the Warming Hut's free drink.
 *
 * The same command as the meal with a different pool — it is the same
 * verb at a different altitude, and giving it its own domain module would
 * have been two copies of one transaction to keep in step forever.
 */
export async function claimDrinkAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = dailyLocationPath(DRINK_LOCATION_SLUG, DRINK_REGION_SLUG);
  const parsed = dailyMealSchema.safeParse({
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    failWith(
      returnTo,
      new DomainError("INVALID_INPUT", "Invalid request. Refresh and try again."),
    );
  }
  try {
    const result = await claimDailyMeal(prisma, {
      userId: user.id,
      poolSlug: WARMING_HUT_POOL_SLUG,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidateDaily(DRINK_LOCATION_SLUG, DRINK_REGION_SLUG);
    succeedWith(
      returnTo,
      result.alreadyClaimed
        ? `You've already had one today: ${result.itemName}.`
        : `Something hot: ${result.itemName}.`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    if (!(error instanceof DomainError)) {
      log.error("daily-drink.action-error", {
        userId: user.id,
        message: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
    }
    failWith(returnTo, error, { op: "claim-drink", userId: user.id });
  }
}
