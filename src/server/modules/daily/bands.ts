import { createHmac } from "node:crypto";
import type { GameDate } from "./game-day";

/**
 * Rotation bands: the shared anti-leak machinery behind the daily
 * activities whose answer can be posted somewhere (ADR-44, ADR-45).
 *
 * The problem both the word puzzle and the lantern hunt have is the same.
 * Each reveals its answer eventually — the word game tells a player who
 * fails, the lantern is somewhere a friend can just name — so a single
 * global answer is a public fact minutes after the reset, and the day's
 * reward becomes free to anybody who reads one message.
 *
 * Two pieces, and the split is the whole design:
 *
 * 1. **A player's band is public and cheap.** Derived from the user id, so
 *    there is no column, no assignment at sign-up, and no backfill when
 *    the band count changes. Knowing your own band is harmless.
 * 2. **What a band gets is keyed by a server secret.** Knowing your own
 *    answers says nothing about any other band's. This is the part that
 *    closes the farm: bands selected by plain arithmetic would only raise
 *    the cost from one sacrifice account to a one-off mapping of every
 *    band, after which every future day is computable for free. Keyed, the
 *    cost is one burned account per band *per day*, permanently.
 */

/**
 * How many independent rotations run at once.
 *
 * 32 is chosen against the cost, not plucked: 32× the farming price, and
 * it stays well under the smallest answer pool it has to divide (100 word
 * answers per difficulty) so bands can genuinely differ. Raising it later
 * is safe — bands are derived, never stored, so accounts simply
 * redistribute and frozen rows keep what they froze.
 */
export const ROTATION_BANDS = 32;

/**
 * Secret keying every band→answer mapping.
 *
 * Production must set `DAILY_ROTATION_SECRET`; the fallback is a known
 * development value and `validateServerConfig` refuses to start production
 * with it, the same treatment `RESTOCK_SEED_SECRET` gets. Rotating it
 * changes only future draws — puzzle and hunt rows freeze their reference
 * at creation, so history and in-flight boards are never rewritten.
 */
export function rotationSecret(): string {
  return process.env.DAILY_ROTATION_SECRET ?? "dev-only-daily-rotation";
}

/**
 * The rotation band a player belongs to. Stable for the life of the
 * account and derived from the id alone, so there is nothing to assign at
 * sign-up and nothing to backfill.
 *
 * Keyed with a fixed, non-secret string: which band you are in is not
 * something worth hiding, and deriving it from the real secret would put
 * that secret behind a value the client can observe.
 */
export function bandForUser(userId: string): number {
  const digest = createHmac("sha256", "rotation-band").update(userId).digest();
  return digest.readUInt32BE(0) % ROTATION_BANDS;
}

/**
 * A deterministic, secret-keyed index into a list of `count` options, for
 * one band on one game date.
 *
 * `purpose` is domain separation: the word puzzle and the lantern hunt
 * draw from the same date and band, and without it a band's word would
 * correlate with its hiding place forever. `variant` separates draws
 * inside one activity (the word game's three difficulties).
 *
 * Rejection sampling avoids the modulo bias that would otherwise make the
 * first `2^32 mod count` options slightly likelier — small, but uniformity
 * is the entire anti-farming property here, so it is not a corner to cut.
 */
export function keyedIndex({
  purpose,
  gameDate,
  band,
  count,
  variant = "",
}: {
  purpose: string;
  gameDate: GameDate;
  band: number;
  count: number;
  variant?: string;
}): number {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("keyedIndex requires a positive option count");
  }
  if (!Number.isInteger(band) || band < 0 || band >= ROTATION_BANDS) {
    throw new Error(`keyedIndex requires a band in [0, ${ROTATION_BANDS})`);
  }
  const limit = Math.floor(2 ** 32 / count) * count;
  for (let counter = 0; counter < 64; counter++) {
    const digest = createHmac("sha256", rotationSecret())
      .update(`${purpose}:${gameDate}:${variant}:${band}:${counter}`)
      .digest();
    const value = digest.readUInt32BE(0);
    if (value < limit) {
      return value % count;
    }
  }
  // Astronomically unreachable (each round rejects with probability
  // < count/2^32); falling back beats looping forever.
  return 0;
}
