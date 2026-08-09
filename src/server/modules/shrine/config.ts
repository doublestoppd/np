import type { DbClient } from "@/server/db";
import {
  enforceRateLimit,
  type RateLimitRule,
} from "@/server/security/rate-limit";

/**
 * The Shrine's dials (ADR-69).
 *
 * Two of the limits below are the only thing standing between "a page you
 * decorate" and "a page somebody else writes on", so they are here rather
 * than scattered through the commands.
 */

/** The scrolling headline. Short, because it scrolls. */
export const BANNER_MAX = 80;

/** The body. Long enough for a proper rambling introduction. */
export const BODY_MAX = 4_000;

/** One guestbook message. A paragraph, not an essay. */
export const GUESTBOOK_MAX = 500;

/** How many signatures a page shows. Older ones stay, they just scroll off. */
export const GUESTBOOK_PAGE = 30;

const RULES = {
  /**
   * Saving the page. Generous — a player fiddling with themes is going to
   * hit save a lot, and this only exists to bound automation.
   */
  save: { name: "shrine-save", limit: 40, windowSeconds: 60 },
  /**
   * Signing somebody's guestbook. Tight, and the important one: this is
   * the only way text a player did not write reaches their page.
   */
  sign: { name: "shrine-sign", limit: 6, windowSeconds: 300 },
} satisfies Record<string, RateLimitRule>;

export async function enforceShrineSaveLimit(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES.save, userId, { userId, now });
}

export async function enforceGuestbookLimit(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES.sign, userId, { userId, now });
}
