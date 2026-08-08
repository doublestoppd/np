import { Prisma, type UserRole } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { withIdempotency, requestHash } from "@/server/security/idempotency";
import { canModerate } from "@/lib/roles";
import { ForumError } from "./errors";
import { EDIT_WINDOW_MINUTES, enforceForumRateLimit } from "./config";

/**
 * Writing to the forum (ADR-56).
 *
 * Three rules run through everything here:
 *
 * 1. **Nothing is deleted.** Withdrawing and removing set a visibility and
 *    keep the row and the body. A moderator has to be able to see what
 *    they acted on, a reporter has to be answerable honestly, and a
 *    conversation that loses a post to a hard delete loses the replies'
 *    context with it.
 * 2. **Ordinals come from the thread's own row lock.** `replyCount` and
 *    `lastPostAt` are denormalised for the board index, and the post's
 *    place in the thread is a number two concurrent replies would
 *    otherwise both claim. All three are written inside one transaction
 *    that locks the thread first.
 * 3. **Authority is checked here, not at the page.** Every command takes
 *    the actor's role and decides for itself. A server action is a public
 *    endpoint; a page that does not render a button protects nothing.
 */

export interface ThreadCreated {
  [key: string]: string | number;
  threadId: string;
  boardSlug: string;
  title: string;
}

export interface PostCreated {
  [key: string]: string | number;
  postId: string;
  threadId: string;
  ordinal: number;
}

/**
 * Locks a thread row and returns it, or throws if it cannot take a reply.
 *
 * `FOR UPDATE` rather than an optimistic guard because the next ordinal is
 * read-then-written: two replies computing "count + 1" from the same
 * snapshot both get the same number, and the unique constraint turns that
 * into a 500 for whoever loses. The lock makes them queue instead.
 */
async function lockThreadForReply(
  tx: Prisma.TransactionClient,
  threadId: string,
): Promise<{ id: string; locked: boolean; visibility: string }> {
  const rows = await tx.$queryRaw<
    { id: string; locked: boolean; visibility: string }[]
  >`SELECT "id", "locked", "visibility"::text FROM "ForumThread" WHERE "id" = ${threadId} FOR UPDATE`;
  const thread = rows[0];
  if (!thread) {
    throw new ForumError("THREAD_NOT_FOUND");
  }
  if (thread.visibility !== "VISIBLE") {
    throw new ForumError("THREAD_GONE");
  }
  if (thread.locked) {
    throw new ForumError("THREAD_LOCKED");
  }
  return thread;
}

/**
 * Starts a thread: the thread row and its opening post, together.
 *
 * The opening text is a post like any other rather than a column on the
 * thread, so editing it, withdrawing it, reporting it, and moderating it
 * all work without a single special case. The one thing that IS special is
 * withdrawing it — see `withdrawPost`.
 */
export async function createThread(
  db: DbClient,
  {
    userId,
    role,
    boardSlug,
    title,
    body,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    role: UserRole;
    boardSlug: string;
    title: string;
    body: string;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<{ result: ThreadCreated; replayed: boolean }> {
  const now = clock.now();
  await enforceForumRateLimit(db, "thread-create", userId, now);

  const board = await db.forumBoard.findUnique({ where: { slug: boardSlug } });
  if (!board) {
    throw new ForumError("BOARD_NOT_FOUND");
  }
  if (!board.active) {
    throw new ForumError("BOARD_INACTIVE");
  }
  if (board.staffOnly && !canModerate(role)) {
    throw new ForumError("BOARD_STAFF_ONLY");
  }

  return withIdempotency<ThreadCreated>(
    db,
    {
      userId,
      operation: "forum-thread-create",
      key: idempotencyKey,
      requestHash: requestHash({ boardSlug, title, body }),
    },
    async (tx) => {
      const thread = await tx.forumThread.create({
        data: {
          boardId: board.id,
          authorId: userId,
          title,
          lastPostAt: now,
          createdAt: now,
        },
      });
      await tx.forumPost.create({
        data: {
          threadId: thread.id,
          authorId: userId,
          body,
          ordinal: 1,
          createdAt: now,
        },
      });
      log.info("forum.thread-created", {
        userId,
        threadId: thread.id,
        board: boardSlug,
      });
      return { threadId: thread.id, boardSlug, title };
    },
  );
}

/** Adds a reply to a thread. */
export async function createPost(
  db: DbClient,
  {
    userId,
    threadId,
    body,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    threadId: string;
    body: string;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<{ result: PostCreated; replayed: boolean }> {
  const now = clock.now();
  await enforceForumRateLimit(db, "post-create", userId, now);

  return withIdempotency<PostCreated>(
    db,
    {
      userId,
      operation: "forum-post-create",
      key: idempotencyKey,
      requestHash: requestHash({ threadId, body }),
    },
    async (tx) => {
      await lockThreadForReply(tx, threadId);

      // Under the lock, so the highest ordinal cannot move underneath us.
      const last = await tx.forumPost.findFirst({
        where: { threadId },
        orderBy: { ordinal: "desc" },
        select: { ordinal: true },
      });
      const ordinal = (last?.ordinal ?? 0) + 1;

      const post = await tx.forumPost.create({
        data: { threadId, authorId: userId, body, ordinal, createdAt: now },
      });
      // replyCount counts VISIBLE replies and excludes the opening post,
      // so it says what the board index claims it says.
      await tx.forumThread.update({
        where: { id: threadId },
        data: { lastPostAt: now, replyCount: { increment: 1 } },
      });
      log.info("forum.post-created", { userId, threadId, ordinal });
      return { postId: post.id, threadId, ordinal };
    },
  );
}

/**
 * Edits one's own post, within the window.
 *
 * The window is not a punishment: it stops the record being rewritten
 * under a conversation, where somebody has already replied to what the
 * post used to say and has no way to notice it changed. A moderator is
 * NOT exempt — editing another person's words into different words is not
 * moderation, and the moderator tools remove or hide, never rewrite.
 */
export async function editPost(
  db: DbClient,
  {
    userId,
    postId,
    body,
    clock = systemClock,
  }: { userId: string; postId: string; body: string; clock?: Clock },
): Promise<void> {
  const now = clock.now();
  await enforceForumRateLimit(db, "post-edit", userId, now);

  const post = await db.forumPost.findUnique({
    where: { id: postId },
    include: { thread: { select: { locked: true, visibility: true } } },
  });
  if (!post) {
    throw new ForumError("POST_NOT_FOUND");
  }
  if (post.authorId !== userId) {
    throw new ForumError("NOT_YOURS");
  }
  if (post.visibility !== "VISIBLE") {
    throw new ForumError("POST_GONE");
  }
  if (post.thread.visibility !== "VISIBLE") {
    throw new ForumError("THREAD_GONE");
  }
  if (post.thread.locked) {
    throw new ForumError("THREAD_LOCKED");
  }
  const ageMinutes = (now.getTime() - post.createdAt.getTime()) / 60_000;
  if (ageMinutes > EDIT_WINDOW_MINUTES) {
    // Its own code, not POST_GONE: the post is right there, and telling
    // someone their own visible post does not exist is a lie that reads
    // as a bug.
    throw new ForumError("EDIT_WINDOW_PASSED");
  }

  // Guarded on still being visible and still being theirs: a moderator
  // removing this post while the edit form was open must win.
  const updated = await db.forumPost.updateMany({
    where: { id: postId, authorId: userId, visibility: "VISIBLE" },
    data: { body, editedAt: now },
  });
  if (updated.count === 0) {
    throw new ForumError("POST_GONE");
  }
  log.info("forum.post-edited", { userId, postId });
}

/**
 * Takes one's own post down. Always available, with no window.
 *
 * Withdrawing the OPENING post withdraws the whole thread, because the
 * alternative is a thread whose subject nobody can read and whose replies
 * answer nothing. Replies stay as they are: they are other people's words
 * and are not the opener's to remove.
 */
export async function withdrawPost(
  db: DbClient,
  {
    userId,
    postId,
    clock = systemClock,
  }: { userId: string; postId: string; clock?: Clock },
): Promise<{ withdrewThread: boolean }> {
  const now = clock.now();
  const post = await db.forumPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      ordinal: true,
      threadId: true,
      visibility: true,
    },
  });
  if (!post) {
    throw new ForumError("POST_NOT_FOUND");
  }
  if (post.authorId !== userId) {
    throw new ForumError("NOT_YOURS");
  }
  if (post.visibility !== "VISIBLE") {
    throw new ForumError("POST_GONE");
  }

  const withdrewThread = post.ordinal === 1;
  await db.$transaction(async (tx) => {
    const taken = await tx.forumPost.updateMany({
      where: { id: postId, authorId: userId, visibility: "VISIBLE" },
      data: { visibility: "WITHDRAWN" },
    });
    if (taken.count === 0) {
      throw new ForumError("POST_GONE");
    }
    if (withdrewThread) {
      await tx.forumThread.updateMany({
        where: { id: post.threadId, visibility: "VISIBLE" },
        data: { visibility: "WITHDRAWN" },
      });
    } else {
      // Only replies are counted, and only while visible.
      await tx.forumThread.updateMany({
        where: { id: post.threadId, replyCount: { gt: 0 } },
        data: { replyCount: { decrement: 1 } },
      });
    }
  });
  log.info("forum.post-withdrawn", {
    userId,
    postId,
    threadId: post.threadId,
    withdrewThread,
    at: now.toISOString(),
  });
  return { withdrewThread };
}
