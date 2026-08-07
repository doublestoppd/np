"use server";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import {
  checkGrid,
  saveEntries,
  type SudokuView,
} from "@/server/modules/games/sudoku/attempt";
import { sudokuGridSchema } from "@/lib/validation";
import { DomainError } from "@/server/errors";
import { correlationId, log } from "@/server/logging";
import { publicErrorMessage } from "./shared";

export interface SudokuActionState {
  view: SudokuView | null;
  error: string | null;
  /** True when this call was the one that solved it. */
  justSolved: boolean;
  /** True when a full grid was submitted and was not the solution. */
  wrong: boolean;
  coinsAwarded: string;
  nonce: number;
}

/**
 * Saves working, or judges a finished grid.
 *
 * One action for both, chosen by the `intent` field, because they share
 * the whole payload and half the response. Saving is the common case and
 * fires on every digit; checking happens once or twice.
 *
 * Deliberately does not revalidate: the slate is a client-held grid that
 * already has the authoritative state in this response, and a
 * revalidation would re-render the tree under the player's cursor
 * mid-puzzle.
 */
export async function sudokuAction(
  previous: SudokuActionState,
  formData: FormData,
): Promise<SudokuActionState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;
  const checking = formData.get("intent") === "check";

  const parsed = sudokuGridSchema.safeParse({ entries: formData.get("entries") });
  if (!parsed.success) {
    return { ...previous, error: "That isn't a grid.", nonce };
  }

  try {
    if (!checking) {
      const view = await saveEntries(prisma, {
        userId: user.id,
        entries: parsed.data.entries,
      });
      return {
        view,
        error: null,
        justSolved: false,
        wrong: false,
        coinsAwarded: "0",
        nonce,
      };
    }
    const result = await checkGrid(prisma, {
      userId: user.id,
      entries: parsed.data.entries,
    });
    return {
      view: result.view,
      error: null,
      justSolved: result.justSolved,
      wrong: result.wrong,
      coinsAwarded: result.coinsAwarded,
      nonce,
    };
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log.error("action.failed", {
        op: checking ? "sudoku-check" : "sudoku-save",
        userId: user.id,
        correlationId: correlationId(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return {
      ...previous,
      error: publicErrorMessage(error),
      justSolved: false,
      wrong: false,
      nonce,
    };
  }
}
