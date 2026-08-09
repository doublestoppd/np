import type { DbClient, DbReader } from "@/server/db";
import { systemClock, type Clock } from "@/server/clock";
import { log } from "@/server/logging";
import { isAtLeast } from "@/lib/roles";
import { enforceGuestbookLimit, GUESTBOOK_PAGE } from "./config";
import { ShrineError } from "./errors";

/**
 * Signing somebody's guestbook (ADR-69). SERVER ONLY.
 *
 * **Who can take an entry down is the whole moderation model here, and it
 * is deliberately not the forums'.** A guestbook is a page somebody else
 * owns; the thing that makes it safe to hand strangers a text box is that
 * the owner can remove anything on it, instantly, without asking anybody.
 * Moderators can too, for the case where the owner is the problem or has
 * stopped visiting.
 *
 * There is no report queue for these. The forums have one because a board
 * belongs to everybody and nobody can clear their own thread; a shrine has
 * exactly one person with both the motive and the authority to keep it
 * clean, and they are already looking at it.
 *
 * Entries are hidden rather than deleted, so a moderator can still read
 * what was said after the owner has swept it away.
 */

export interface GuestbookEntryView {
  id: string;
  author: string;
  body: string;
  at: Date;
  /** True when the viewer may take this one down. */
  canRemove: boolean;
}

/** Signs it. The author is the signed-in viewer, never a submitted name. */
export async function signGuestbook(
  db: DbClient,
  {
    shrineId,
    authorId,
    body,
    clock = systemClock,
  }: { shrineId: string; authorId: string; body: string; clock?: Clock },
) {
  const text = body.trim();
  if (text.length === 0) throw new ShrineError("EMPTY");

  await enforceGuestbookLimit(db, authorId, clock.now());

  // Read inside the command, not passed in: whether the book is open is a
  // fact about the world at the moment of signing, and a caller that
  // checked a second ago would let a closed book take one more.
  const shrine = await db.shrine.findUnique({
    where: { id: shrineId },
    select: { id: true, userId: true, published: true, guestbookOpen: true },
  });
  if (!shrine) throw new ShrineError("NO_SHRINE");
  if (!shrine.published) throw new ShrineError("NOT_PUBLISHED");
  if (!shrine.guestbookOpen) throw new ShrineError("GUESTBOOK_CLOSED");
  if (shrine.userId === authorId) throw new ShrineError("OWN_GUESTBOOK");

  return db.shrineGuestbookEntry.create({
    data: { shrineId, authorId, body: text },
  });
}

/**
 * Takes an entry down.
 *
 * Guarded by an `updateMany` whose `where` carries the permission, so the
 * authorization and the write are one statement — there is no window
 * between checking who owns the shrine and hiding the row.
 */
export async function hideGuestbookEntry(
  db: DbClient,
  {
    entryId,
    actorId,
    actorRole,
    clock = systemClock,
  }: {
    entryId: string;
    actorId: string;
    actorRole: string;
    clock?: Clock;
  },
): Promise<void> {
  const moderator = isAtLeast(
    actorRole as Parameters<typeof isAtLeast>[0],
    "MODERATOR",
  );

  const { count } = await db.shrineGuestbookEntry.updateMany({
    where: {
      id: entryId,
      hidden: false,
      // A moderator may hide any entry; anybody else may hide only what is
      // on their own shrine. Expressed in the query rather than in an `if`
      // above it, so the check cannot drift from the write.
      ...(moderator ? {} : { shrine: { userId: actorId } }),
    },
    data: { hidden: true, hiddenById: actorId, hiddenAt: clock.now() },
  });

  if (count === 0) throw new ShrineError("NOT_YOURS");
  log.info("shrine.guestbook.hidden", { entryId, actorId, moderator });
}

/** What the page shows. Hidden entries are not among them, for anybody. */
export async function getGuestbook(
  db: DbReader,
  {
    shrineId,
    viewerId,
    viewerRole,
    ownerId,
  }: {
    shrineId: string;
    viewerId: string | null;
    viewerRole: string | null;
    ownerId: string;
  },
): Promise<GuestbookEntryView[]> {
  const entries = await db.shrineGuestbookEntry.findMany({
    where: { shrineId, hidden: false },
    orderBy: { createdAt: "desc" },
    take: GUESTBOOK_PAGE,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { username: true } },
    },
  });

  const canRemove =
    viewerId !== null &&
    (viewerId === ownerId ||
      (viewerRole !== null &&
        isAtLeast(viewerRole as Parameters<typeof isAtLeast>[0], "MODERATOR")));

  return entries.map((entry) => ({
    id: entry.id,
    author: entry.author.username,
    body: entry.body,
    at: entry.createdAt,
    canRemove,
  }));
}
