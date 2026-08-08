import type { DbReader } from "@/server/db";
import type { ForumVisibility, UserRole } from "@prisma/client";
import { canModerate } from "@/lib/roles";
import { POSTS_PER_PAGE, THREADS_PER_PAGE } from "./config";

/**
 * Reading the forum (ADR-56).
 *
 * **A moderator sees removed content; nobody else does.** That asymmetry
 * is the reason these take a role rather than filtering in the page: a
 * query that returned everything and trusted the component to hide it
 * would leak a removed post through any surface that forgot — and "any
 * surface that forgot" includes ones nobody has written yet.
 *
 * Withdrawn and removed rows keep their place in the thread rather than
 * vanishing. A conversation with a hole in it reads as a conversation
 * where something was said and taken back, which is what happened. The
 * body is not sent to anyone but a moderator.
 */

export interface ForumBoardSummary {
  slug: string;
  name: string;
  description: string;
  staffOnly: boolean;
  threadCount: number;
  lastPostAt: Date | null;
}

export interface ForumThreadSummary {
  id: string;
  title: string;
  authorUsername: string;
  pinned: boolean;
  locked: boolean;
  visibility: ForumVisibility;
  replyCount: number;
  lastPostAt: Date;
  createdAt: Date;
}

export interface ForumPostView {
  id: string;
  authorUsername: string;
  authorRole: UserRole;
  /** Null when the post is not visible and the reader may not see it. */
  body: string | null;
  visibility: ForumVisibility;
  ordinal: number;
  editedAt: Date | null;
  createdAt: Date;
  /** This reader may edit it right now. */
  canEdit: boolean;
  /** This reader may take it down. */
  canWithdraw: boolean;
}

export interface ForumThreadView {
  id: string;
  boardSlug: string;
  boardName: string;
  title: string;
  authorUsername: string;
  pinned: boolean;
  locked: boolean;
  visibility: ForumVisibility;
  posts: ForumPostView[];
  page: number;
  pageCount: number;
  /** This reader may reply right now. */
  canReply: boolean;
}

/** Which visibilities this reader is allowed to see the body of. */
function visibleTo(role: UserRole): ForumVisibility[] {
  return canModerate(role)
    ? ["VISIBLE", "WITHDRAWN", "REMOVED"]
    : ["VISIBLE"];
}

/** The board index. */
export async function listBoards(
  db: DbReader,
): Promise<ForumBoardSummary[]> {
  const boards = await db.forumBoard.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { slug: "asc" }],
  });
  return Promise.all(
    boards.map(async (board) => {
      const threadCount = await db.forumThread.count({
        where: { boardId: board.id, visibility: "VISIBLE" },
      });
      const latest = await db.forumThread.findFirst({
        where: { boardId: board.id, visibility: "VISIBLE" },
        orderBy: { lastPostAt: "desc" },
        select: { lastPostAt: true },
      });
      return {
        slug: board.slug,
        name: board.name,
        description: board.description,
        staffOnly: board.staffOnly,
        threadCount,
        lastPostAt: latest?.lastPostAt ?? null,
      };
    }),
  );
}

export interface BoardPage {
  slug: string;
  name: string;
  description: string;
  staffOnly: boolean;
  active: boolean;
  threads: ForumThreadSummary[];
  page: number;
  pageCount: number;
  /** This reader may start a thread here. */
  canPost: boolean;
}

/** One board's threads, pinned first then newest activity. */
export async function getBoardPage(
  db: DbReader,
  {
    slug,
    role,
    page = 1,
  }: { slug: string; role: UserRole; page?: number },
): Promise<BoardPage | null> {
  const board = await db.forumBoard.findUnique({ where: { slug } });
  if (!board) {
    return null;
  }
  const where = {
    boardId: board.id,
    visibility: { in: visibleTo(role) },
  };
  const total = await db.forumThread.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / THREADS_PER_PAGE));
  const current = Math.min(Math.max(1, page), pageCount);
  const threads = await db.forumThread.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { lastPostAt: "desc" }],
    skip: (current - 1) * THREADS_PER_PAGE,
    take: THREADS_PER_PAGE,
    include: { author: { select: { username: true } } },
  });
  return {
    slug: board.slug,
    name: board.name,
    description: board.description,
    staffOnly: board.staffOnly,
    active: board.active,
    threads: threads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      authorUsername: thread.author.username,
      pinned: thread.pinned,
      locked: thread.locked,
      visibility: thread.visibility,
      replyCount: thread.replyCount,
      lastPostAt: thread.lastPostAt,
      createdAt: thread.createdAt,
    })),
    page: current,
    pageCount,
    canPost: board.active && (!board.staffOnly || canModerate(role)),
  };
}

/** One thread and a page of its posts. */
export async function getThreadPage(
  db: DbReader,
  {
    threadId,
    userId,
    role,
    page = 1,
    now = new Date(),
    editWindowMinutes,
  }: {
    threadId: string;
    userId: string;
    role: UserRole;
    page?: number;
    now?: Date;
    editWindowMinutes: number;
  },
): Promise<ForumThreadView | null> {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    include: {
      board: { select: { slug: true, name: true } },
      author: { select: { username: true } },
    },
  });
  if (!thread) {
    return null;
  }
  // A removed thread is not readable by the people it was removed from.
  if (thread.visibility !== "VISIBLE" && !canModerate(role)) {
    return null;
  }

  const total = await db.forumPost.count({ where: { threadId } });
  const pageCount = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
  const current = Math.min(Math.max(1, page), pageCount);
  const posts = await db.forumPost.findMany({
    where: { threadId },
    orderBy: { ordinal: "asc" },
    skip: (current - 1) * POSTS_PER_PAGE,
    take: POSTS_PER_PAGE,
    include: { author: { select: { username: true, role: true } } },
  });

  const readable = new Set(visibleTo(role));
  return {
    id: thread.id,
    boardSlug: thread.board.slug,
    boardName: thread.board.name,
    title: thread.title,
    authorUsername: thread.author.username,
    pinned: thread.pinned,
    locked: thread.locked,
    visibility: thread.visibility,
    page: current,
    pageCount,
    canReply: thread.visibility === "VISIBLE" && !thread.locked,
    posts: posts.map((post) => {
      const mine = post.authorId === userId;
      const live = post.visibility === "VISIBLE";
      const ageMinutes = (now.getTime() - post.createdAt.getTime()) / 60_000;
      return {
        id: post.id,
        authorUsername: post.author.username,
        authorRole: post.author.role,
        // The one place the body is withheld. Everything downstream can
        // render `body` without knowing the rules.
        body: readable.has(post.visibility) ? post.body : null,
        visibility: post.visibility,
        ordinal: post.ordinal,
        editedAt: post.editedAt,
        createdAt: post.createdAt,
        canEdit:
          mine &&
          live &&
          !thread.locked &&
          thread.visibility === "VISIBLE" &&
          ageMinutes <= editWindowMinutes,
        canWithdraw: mine && live,
      };
    }),
  };
}
