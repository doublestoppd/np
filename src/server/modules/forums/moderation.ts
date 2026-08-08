import { Prisma, type ModerationActionType, type UserRole } from "@prisma/client";
import type { DbClient, DbReader } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { canModerate } from "@/lib/roles";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { ForumError } from "./errors";

/**
 * Moderation (ADR-56): reporting, and what a moderator can do about it.
 *
 * The model is **post-moderation**. Everything is visible the moment it is
 * posted and comes down afterwards, because a pre-moderation queue nobody
 * staffs is a forum nobody can use — and during alpha there is one
 * moderator, who is also the person building the game.
 *
 * That choice has a cost and this module is where it is paid: the tools
 * have to be fast, the trail has to be complete, and the reporter has to
 * be able to say something is wrong without an argument.
 *
 * ## The three rules
 *
 * 1. **A report snapshots the body.** Without it, an author could post
 *    something, be reported, edit it into something harmless, and the
 *    moderator would open the queue and find nothing wrong. What the
 *    reporter saw is what the moderator sees.
 * 2. **Every moderator action is recorded before it is applied**, in the
 *    same transaction. A trail written afterwards is a trail with a gap
 *    exactly where something went wrong.
 * 3. **Removal reasons are never shown to players.** A removal notice
 *    that explains itself invites an argument with the notice; the person
 *    whose post it was should be talking to a moderator, not to a string.
 */

/**
 * Reporting is rate-limited harder than posting.
 *
 * A report costs the reporter nothing and costs a moderator attention, so
 * it is the one action here where volume is the abuse. The unique
 * constraint stops the same post being reported twice by one person; this
 * stops one person reporting fifty different posts in a minute.
 */
const REPORT_RULE = {
  name: "forum-report",
  limit: 10,
  windowSeconds: 600,
};

export interface ReportFiled {
  reportId: string;
  /** False when this person had already reported this post. */
  filed: boolean;
}

/**
 * Files a report against a post.
 *
 * Reporting your own post is refused — not because it is harmful, but
 * because withdrawing is right there and does the thing they actually
 * want without occupying a moderator.
 */
export async function reportPost(
  db: DbClient,
  {
    userId,
    postId,
    reason,
    clock = systemClock,
  }: { userId: string; postId: string; reason: string; clock?: Clock },
): Promise<ReportFiled> {
  const now = clock.now();
  await enforceRateLimit(db, REPORT_RULE, userId, { userId, now });

  const post = await db.forumPost.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, body: true, visibility: true },
  });
  if (!post) {
    throw new ForumError("POST_NOT_FOUND");
  }
  if (post.authorId === userId) {
    throw new ForumError("REPORT_OWN_POST");
  }
  if (post.visibility !== "VISIBLE") {
    // Already gone. Nothing to report, and saying so is kinder than
    // filing a report against something no moderator needs to see.
    throw new ForumError("POST_GONE");
  }

  try {
    const report = await db.forumReport.create({
      data: {
        postId,
        reporterId: userId,
        reason,
        // The snapshot. This is the whole reason an edit cannot outrun a
        // report.
        bodyAtReport: post.body,
        createdAt: now,
      },
    });
    log.info("forum.report-filed", { userId, postId, reportId: report.id });
    return { reportId: report.id, filed: true };
  } catch (error) {
    // Already reported by this person. Not an error to them: their report
    // is on the pile, which is what they wanted.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await db.forumReport.findUniqueOrThrow({
        where: { postId_reporterId: { postId, reporterId: userId } },
      });
      return { reportId: existing.id, filed: false };
    }
    throw error;
  }
}

/** Writes the trail entry. Always called inside the acting transaction. */
async function record(
  tx: Prisma.TransactionClient,
  {
    moderatorId,
    type,
    postId,
    threadId,
    reason,
    now,
  }: {
    moderatorId: string;
    type: ModerationActionType;
    postId?: string;
    threadId?: string;
    reason: string;
    now: Date;
  },
): Promise<void> {
  await tx.moderationAction.create({
    data: {
      moderatorId,
      type,
      postId: postId ?? null,
      threadId: threadId ?? null,
      reason,
      createdAt: now,
    },
  });
}

function assertModerator(role: UserRole): void {
  if (!canModerate(role)) {
    throw new ForumError("NOT_A_MODERATOR");
  }
}

/**
 * Takes a post down, and closes every open report against it.
 *
 * Removing is not the same as the author withdrawing, and the two are
 * kept distinct in the visibility rather than collapsed: "the author
 * thought better of it" and "a moderator took this down" are different
 * facts, and a trail that cannot tell them apart cannot answer the only
 * question anyone ever asks of it.
 */
export async function removePost(
  db: DbClient,
  {
    moderatorId,
    role,
    postId,
    reason,
    clock = systemClock,
  }: {
    moderatorId: string;
    role: UserRole;
    postId: string;
    reason: string;
    clock?: Clock;
  },
): Promise<void> {
  assertModerator(role);
  const now = clock.now();

  const post = await db.forumPost.findUnique({
    where: { id: postId },
    select: { id: true, ordinal: true, threadId: true, visibility: true },
  });
  if (!post) {
    throw new ForumError("POST_NOT_FOUND");
  }

  await db.$transaction(async (tx) => {
    await record(tx, {
      moderatorId,
      type: "POST_REMOVED",
      postId,
      reason,
      now,
    });
    const taken = await tx.forumPost.updateMany({
      where: { id: postId, visibility: { not: "REMOVED" } },
      data: { visibility: "REMOVED" },
    });
    // Only adjust the count if this post was actually visible: removing
    // an already-withdrawn post must not decrement twice.
    if (taken.count > 0 && post.visibility === "VISIBLE" && post.ordinal > 1) {
      await tx.forumThread.updateMany({
        where: { id: post.threadId, replyCount: { gt: 0 } },
        data: { replyCount: { decrement: 1 } },
      });
    }
    // Removing the opening post removes the thread, for the same reason
    // withdrawing it withdraws the thread.
    if (post.ordinal === 1) {
      await record(tx, {
        moderatorId,
        type: "THREAD_REMOVED",
        threadId: post.threadId,
        reason,
        now,
      });
      await tx.forumThread.updateMany({
        where: { id: post.threadId },
        data: { visibility: "REMOVED" },
      });
    }
    await tx.forumReport.updateMany({
      where: { postId, status: "OPEN" },
      data: {
        status: "UPHELD",
        resolvedById: moderatorId,
        resolvedAt: now,
        resolutionNote: reason,
      },
    });
  });
  log.warn("forum.post-removed", { moderatorId, postId, reason });
}

/** Puts a removed post back. Its reports are NOT reopened. */
export async function restorePost(
  db: DbClient,
  {
    moderatorId,
    role,
    postId,
    reason,
    clock = systemClock,
  }: {
    moderatorId: string;
    role: UserRole;
    postId: string;
    reason: string;
    clock?: Clock;
  },
): Promise<void> {
  assertModerator(role);
  const now = clock.now();
  const post = await db.forumPost.findUnique({
    where: { id: postId },
    select: { ordinal: true, threadId: true, visibility: true },
  });
  if (!post) {
    throw new ForumError("POST_NOT_FOUND");
  }
  // A post the AUTHOR withdrew is not a moderator's to put back.
  if (post.visibility !== "REMOVED") {
    throw new ForumError("NOT_REMOVED");
  }

  await db.$transaction(async (tx) => {
    await record(tx, {
      moderatorId,
      type: "POST_RESTORED",
      postId,
      reason,
      now,
    });
    await tx.forumPost.updateMany({
      where: { id: postId, visibility: "REMOVED" },
      data: { visibility: "VISIBLE" },
    });
    if (post.ordinal > 1) {
      await tx.forumThread.updateMany({
        where: { id: post.threadId },
        data: { replyCount: { increment: 1 } },
      });
    } else {
      await record(tx, {
        moderatorId,
        type: "THREAD_RESTORED",
        threadId: post.threadId,
        reason,
        now,
      });
      await tx.forumThread.updateMany({
        where: { id: post.threadId, visibility: "REMOVED" },
        data: { visibility: "VISIBLE" },
      });
    }
  });
  log.warn("forum.post-restored", { moderatorId, postId, reason });
}

/**
 * Locks, unlocks, pins, or unpins a thread.
 *
 * One function rather than four, because they are the same operation with
 * a different column and the trail entry is the only thing that differs.
 * Locking never hides anything: ending a conversation is not erasing it.
 */
export async function setThreadFlag(
  db: DbClient,
  {
    moderatorId,
    role,
    threadId,
    flag,
    value,
    reason,
    clock = systemClock,
  }: {
    moderatorId: string;
    role: UserRole;
    threadId: string;
    flag: "locked" | "pinned";
    value: boolean;
    reason: string;
    clock?: Clock;
  },
): Promise<void> {
  assertModerator(role);
  const now = clock.now();
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    select: { id: true },
  });
  if (!thread) {
    throw new ForumError("THREAD_NOT_FOUND");
  }

  const type: ModerationActionType =
    flag === "locked"
      ? value
        ? "THREAD_LOCKED"
        : "THREAD_UNLOCKED"
      : value
        ? "THREAD_PINNED"
        : "THREAD_UNPINNED";

  await db.$transaction(async (tx) => {
    await record(tx, { moderatorId, type, threadId, reason, now });
    await tx.forumThread.update({
      where: { id: threadId },
      data: flag === "locked" ? { locked: value } : { pinned: value },
    });
  });
  log.info("forum.thread-flagged", { moderatorId, threadId, flag, value });
}

/** Closes a report without acting on the post. */
export async function dismissReport(
  db: DbClient,
  {
    moderatorId,
    role,
    reportId,
    note,
    clock = systemClock,
  }: {
    moderatorId: string;
    role: UserRole;
    reportId: string;
    note: string;
    clock?: Clock;
  },
): Promise<void> {
  assertModerator(role);
  const now = clock.now();
  const report = await db.forumReport.findUnique({
    where: { id: reportId },
    select: { postId: true, status: true },
  });
  if (!report) {
    throw new ForumError("REPORT_NOT_FOUND");
  }
  if (report.status !== "OPEN") {
    throw new ForumError("REPORT_CLOSED");
  }

  await db.$transaction(async (tx) => {
    await record(tx, {
      moderatorId,
      type: "REPORT_DISMISSED",
      postId: report.postId,
      reason: note,
      now,
    });
    await tx.forumReport.updateMany({
      where: { id: reportId, status: "OPEN" },
      data: {
        status: "DISMISSED",
        resolvedById: moderatorId,
        resolvedAt: now,
        resolutionNote: note,
      },
    });
  });
  log.info("forum.report-dismissed", { moderatorId, reportId });
}

export interface QueuedReport {
  reportId: string;
  postId: string;
  threadId: string;
  threadTitle: string;
  boardSlug: string;
  reporterUsername: string;
  authorUsername: string;
  reason: string;
  /** What the reporter saw. */
  bodyAtReport: string;
  /** What it says now — different means it was edited after reporting. */
  bodyNow: string;
  edited: boolean;
  postVisibility: string;
  createdAt: Date;
  /** How many people have an open report against this post. */
  otherOpenReports: number;
}

/**
 * The open queue, oldest first.
 *
 * Oldest first is deliberate: newest-first means a busy day buries the
 * report nobody has looked at yet under the ones that just arrived, and
 * the one nobody has looked at is precisely the one that matters.
 *
 * Both bodies are returned so the moderator can see an edit-after-report
 * for what it is, rather than being quietly shown the sanitised version.
 */
export async function getReportQueue(
  db: DbReader,
  { role, limit = 50 }: { role: UserRole; limit?: number },
): Promise<QueuedReport[]> {
  assertModerator(role);
  const reports = await db.forumReport.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      reporter: { select: { username: true } },
      post: {
        include: {
          author: { select: { username: true } },
          thread: {
            select: {
              id: true,
              title: true,
              board: { select: { slug: true } },
            },
          },
        },
      },
    },
  });

  return Promise.all(
    reports.map(async (report) => ({
      reportId: report.id,
      postId: report.postId,
      threadId: report.post.thread.id,
      threadTitle: report.post.thread.title,
      boardSlug: report.post.thread.board.slug,
      reporterUsername: report.reporter.username,
      authorUsername: report.post.author.username,
      reason: report.reason,
      bodyAtReport: report.bodyAtReport,
      bodyNow: report.post.body,
      edited: report.bodyAtReport !== report.post.body,
      postVisibility: report.post.visibility,
      createdAt: report.createdAt,
      otherOpenReports: await db.forumReport.count({
        where: { postId: report.postId, status: "OPEN", id: { not: report.id } },
      }),
    })),
  );
}

export interface TrailEntry {
  id: string;
  moderatorUsername: string;
  type: ModerationActionType;
  postId: string | null;
  threadId: string | null;
  reason: string;
  createdAt: Date;
}

/** The moderation trail, newest first. Moderators only. */
export async function getModerationTrail(
  db: DbReader,
  { role, limit = 50 }: { role: UserRole; limit?: number },
): Promise<TrailEntry[]> {
  assertModerator(role);
  const rows = await db.moderationAction.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { moderator: { select: { username: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    moderatorUsername: row.moderator.username,
    type: row.type,
    postId: row.postId,
    threadId: row.threadId,
    reason: row.reason,
    createdAt: row.createdAt,
  }));
}
