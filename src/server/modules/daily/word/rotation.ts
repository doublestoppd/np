import { startOfGameDate, type GameDate } from "../game-day";
import { WORD_ROTATION_EPOCH } from "./config";

/**
 * Ordered answer rotation (docs/architecture-decisions.md ADR-23): each
 * difficulty advances one answer per global game day and wraps after the
 * last active answer. Pure date arithmetic — no randomness, no secrets.
 */

const DAY_MS = 86_400_000;

/** Whole game days since the rotation epoch (negative before it). */
export function daysSinceRotationEpoch(gameDate: GameDate): number {
  return Math.round(
    (startOfGameDate(gameDate).getTime() -
      startOfGameDate(WORD_ROTATION_EPOCH).getTime()) /
      DAY_MS,
  );
}

/**
 * The index into the ACTIVE ordered answer list for a game date.
 * Wraps in both directions so dates before the epoch stay valid.
 */
export function rotationIndex(gameDate: GameDate, activeCount: number): number {
  if (!Number.isInteger(activeCount) || activeCount <= 0) {
    throw new Error("rotationIndex requires a positive active answer count");
  }
  const days = daysSinceRotationEpoch(gameDate);
  return ((days % activeCount) + activeCount) % activeCount;
}
