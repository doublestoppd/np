import type { WordDifficulty } from "@prisma/client";
import type { GameDate } from "../game-day";
import { keyedIndex } from "../bands";

/**
 * Which answer a player gets, and when.
 *
 * Originally one global answer per game date (ADR-23): pure date
 * arithmetic, no secrets, everyone on the same word. A red team confirmed
 * the obvious consequence — the game reveals the answer once a board is
 * FAILED, so one sacrifice account per day handed every other account
 * three free solves, worth 210 coins each (ADR-42 recorded this and
 * deferred it). The rotation is now per **band**, and a band's answer is
 * keyed rather than computed.
 *
 * The banding itself, and the reasoning for keying it, live in
 * modules/daily/bands.ts — the lantern hunt runs on the same machinery.
 * This module is only the word game's use of it.
 *
 * Determinism is preserved: same inputs, same answer, forever. Puzzle rows
 * are still frozen once created, so a secret rotation can never rewrite a
 * played puzzle.
 */

/**
 * The index into the ACTIVE ordered answer list for one band on one game
 * date. The difficulty is the draw variant, so a band does not get the
 * same position three times over.
 */
export function rotationIndex(
  gameDate: GameDate,
  activeCount: number,
  band: number,
  difficulty: WordDifficulty,
): number {
  return keyedIndex({
    purpose: "word",
    gameDate,
    band,
    count: activeCount,
    variant: difficulty,
  });
}
