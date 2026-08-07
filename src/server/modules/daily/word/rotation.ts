import { createHmac } from "node:crypto";
import type { WordDifficulty } from "@prisma/client";
import type { GameDate } from "../game-day";
import { WORD_BANDS, wordRotationSecret } from "./config";

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
 * Two pieces, and the split is the whole design:
 *
 * 1. **A player's band is public and cheap** — derived from their user id,
 *    no column, no assignment step, no migration for existing accounts.
 *    Knowing which band you are in is harmless.
 * 2. **A band's answer is keyed by a server secret** — so knowing your own
 *    answers tells you nothing about any other band's. This is the part
 *    that actually closes the farm. Bands alone, still selected by date
 *    arithmetic, would only have raised the cost from one sacrifice
 *    account to a one-off mapping of every band: an attacker who learned
 *    the ordered pool and the offsets could then compute every future day
 *    for free. With the answer keyed, covering the player base costs one
 *    sacrifice account per band *per day*, permanently.
 *
 * Determinism is preserved: same inputs, same answer, forever. Puzzle rows
 * are still frozen once created, so a secret rotation can never rewrite a
 * played puzzle.
 */

/**
 * The rotation band a player belongs to. Stable for the life of the
 * account and derived from the id alone, so there is nothing to assign at
 * sign-up and nothing to backfill.
 */
export function bandForUser(userId: string): number {
  const digest = createHmac("sha256", "word-band").update(userId).digest();
  return digest.readUInt32BE(0) % WORD_BANDS;
}

/**
 * The index into the ACTIVE ordered answer list for one band on one game
 * date.
 *
 * Keyed by the server secret, so the mapping cannot be extrapolated from
 * observed answers. Rejection sampling avoids the modulo bias that would
 * otherwise make the first `2^32 mod activeCount` answers slightly more
 * likely — small, but this is the one function whose uniformity is the
 * anti-farming property.
 */
export function rotationIndex(
  gameDate: GameDate,
  activeCount: number,
  band: number,
  difficulty: WordDifficulty,
): number {
  if (!Number.isInteger(activeCount) || activeCount <= 0) {
    throw new Error("rotationIndex requires a positive active answer count");
  }
  if (!Number.isInteger(band) || band < 0 || band >= WORD_BANDS) {
    throw new Error(`rotationIndex requires a band in [0, ${WORD_BANDS})`);
  }
  const limit = Math.floor(2 ** 32 / activeCount) * activeCount;
  for (let counter = 0; counter < 64; counter++) {
    const digest = createHmac("sha256", wordRotationSecret())
      .update(`${gameDate}:${difficulty}:${band}:${counter}`)
      .digest();
    const value = digest.readUInt32BE(0);
    if (value < limit) {
      return value % activeCount;
    }
  }
  // Astronomically unreachable (each round rejects with probability
  // < activeCount/2^32); falling back beats looping forever.
  return 0;
}
