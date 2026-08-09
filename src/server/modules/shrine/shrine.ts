import type { ShrineEffect, ShrineTheme, ShrineTune } from "@prisma/client";
import type { DbClient, DbReader } from "@/server/db";
import { systemClock, type Clock } from "@/server/clock";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { serializeStickers } from "@/lib/shrine/themes";
import { enforceShrineSaveLimit } from "./config";
import { ShrineError } from "./errors";

/**
 * A player's hand-decorated page (ADR-69). SERVER ONLY.
 *
 * **Everything a visitor sees is either a choice from a fixed catalogue or
 * plain text.** The theme is an enum, the stickers are keys checked against
 * a catalogue, and the banner and body are strings that get rendered as
 * text by React. There is no path by which a player's input becomes markup,
 * a style rule, or a script — which is the only reason a page like this can
 * exist on a site with a login.
 */

export interface ShrineDraft {
  theme: ShrineTheme;
  effect: ShrineEffect;
  tune: ShrineTune;
  banner: string;
  blink: boolean;
  body: string;
  stickers: string[];
  published: boolean;
  guestbookOpen: boolean;
}

/**
 * The owner's shrine, made if it is not there yet.
 *
 * Lazily, on first edit: a row per account for everybody who never opens
 * the editor is a table full of pages nobody built.
 */
export async function ensureShrine(db: DbClient, userId: string) {
  const existing = await db.shrine.findUnique({ where: { userId } });
  if (existing) return existing;
  // `upsert` rather than `create` for the two-tabs case, where both find
  // nothing and both try to make one.
  return db.shrine.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

/** Saves the whole page in one go. The editor is a single form. */
export async function saveShrine(
  db: DbClient,
  {
    userId,
    draft,
    clock = systemClock,
  }: { userId: string; draft: ShrineDraft; clock?: Clock },
) {
  await enforceShrineSaveLimit(db, userId, clock.now());
  await ensureShrine(db, userId);

  return db.shrine.update({
    where: { userId },
    data: {
      theme: draft.theme,
      effect: draft.effect,
      tune: draft.tune,
      // Trimmed here rather than in the action: the domain is what decides
      // what a stored value looks like, and a banner of eighty spaces
      // would otherwise scroll past forever saying nothing.
      banner: draft.banner.trim(),
      blink: draft.blink,
      body: draft.body.trim(),
      // Re-serialized through the catalogue, so an unknown key cannot be
      // stored even if one somehow gets past the action's validation.
      stickers: serializeStickers(draft.stickers),
      published: draft.published,
      guestbookOpen: draft.guestbookOpen,
    },
  });
}

/**
 * Counts a visit, at most once per viewer per shrine per day.
 *
 * **The counter is the point and the dedup is what makes it mean anything.**
 * Every one of these in 1999 counted page loads, which is why every one of
 * them was a lie — you could sit on F5 and watch your own popularity climb.
 * A unique-viewer-per-day counter still climbs, still reads as an odometer,
 * and cannot be inflated by the owner reloading.
 *
 * The insert is the lock: the unique constraint means two tabs racing
 * produce one row and one increment. A duplicate is not an error here, it
 * is the expected answer, so it is swallowed rather than reported.
 */
export async function countVisit(
  db: DbClient,
  {
    shrineId,
    viewerKey,
    clock = systemClock,
  }: { shrineId: string; viewerKey: string; clock?: Clock },
): Promise<boolean> {
  const day = currentGameDate(clock);
  try {
    await db.$transaction(async (tx) => {
      await tx.shrineVisit.create({ data: { shrineId, viewerKey, day } });
      await tx.shrine.update({
        where: { id: shrineId },
        data: { visits: { increment: 1 } },
      });
    });
    return true;
  } catch {
    // Already counted today, or the shrine went away mid-request. Neither
    // is worth failing a page render over — this is a decoration.
    return false;
  }
}

/** The owner's own view, whether or not it is published. */
export async function getOwnShrine(db: DbClient, userId: string) {
  return ensureShrine(db, userId);
}

/**
 * Somebody else's, by username, and only if they opened it.
 *
 * Unpublished returns null rather than throwing: a page nobody has
 * published should be indistinguishable from one that does not exist.
 */
export async function getPublicShrine(
  db: DbReader,
  { username }: { username: string },
) {
  const shrine = await db.shrine.findFirst({
    where: {
      published: true,
      user: { normalizedUsername: username.toLowerCase() },
    },
  });
  return shrine ?? null;
}

/** For the editor's "you must have one to look at it" guard. */
export function requireShrine<T>(shrine: T | null): T {
  if (!shrine) throw new ShrineError("NO_SHRINE");
  return shrine;
}
