"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { spinFortune } from "@/server/modules/fortune/spin";
import { getFortuneJackpot } from "@/server/modules/fortune/jackpot";
import { fortuneSpinSchema } from "@/lib/validation";
import { correlationId, log } from "@/server/logging";
import { DomainError } from "@/server/errors";
import { publicErrorMessage } from "./shared";

/**
 * Pulling the Fortune Engine (ADR-66).
 *
 * The stake arrives from the client and is the ONLY thing that does — no
 * reel stops, no symbols, no payout, no jackpot flag. It is validated
 * against the ladder by Zod here and again by the domain, which is the one
 * that matters.
 */

export interface FortuneSpinState {
  /** The nine faces the reels stopped on, as `[reel][row]`. */
  window: string[][];
  /** Which paylines paid, best first, for the highlight on the grid. */
  wins: { line: number; label: string; multiple: number }[];
  line: string;
  stake: string;
  payout: string;
  jackpot: boolean;
  /** The authoritative balance after the pull. */
  balance: string;
  /** What the pool stands at now, so a win visibly resets it. */
  jackpotStandsAt: string;
  error: string | null;
  nonce: number;
}

export async function spinFortuneAction(
  previous: FortuneSpinState,
  formData: FormData,
): Promise<FortuneSpinState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;
  const unchanged = {
    window: [] as string[][],
    wins: [] as { line: number; label: string; multiple: number }[],
    line: "",
    stake: "0",
    payout: "0",
    jackpot: false,
    balance: previous.balance,
    jackpotStandsAt: previous.jackpotStandsAt,
  };

  const parsed = fortuneSpinSchema.safeParse({
    stake: formData.get("stake"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return { ...unchanged, error: "Invalid request.", nonce };
  }

  try {
    const { result } = await spinFortune(prisma, {
      userId: user.id,
      stake: BigInt(parsed.data.stake),
      idempotencyKey: parsed.data.idempotencyKey,
    });
    // The wallet moved, so the coin figure in the app shell is stale.
    revalidatePath("/");
    const jackpot = await getFortuneJackpot(prisma);
    return {
      window: result.window,
      wins: result.wins,
      line: result.line,
      stake: result.stake,
      payout: result.payout,
      jackpot: result.jackpot,
      balance: result.balance,
      jackpotStandsAt: jackpot.standsAt,
      error: null,
      nonce,
    };
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log.error("action.failed", {
        correlationId: correlationId(),
        op: "fortune-spin",
        userId: user.id,
        error:
          error instanceof Error ? error.message.slice(0, 200) : String(error),
      });
    }
    return { ...unchanged, error: publicErrorMessage(error), nonce };
  }
}
