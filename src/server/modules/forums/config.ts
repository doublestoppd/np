import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Forum rate limits (ADR-56).
 *
 * These are the whole anti-abuse story at post time, because moderation
 * here is after the fact: nothing waits in a queue, so nothing but a
 * limiter stands between a script and a thousand posts.
 *
 * Starting a thread is rarer than replying and much more visible — a
 * flood of threads buries a board's front page, where a flood of replies
 * buries one conversation — so it is held tighter.
 *
 * Editing is limited too, which is less obvious. An edit is not a new
 * post, but it IS a way to put new text in front of people repeatedly,
 * and an unlimited edit loop on a popular post is a billboard.
 */
const RULES = {
  "thread-create": { name: "forum-thread-create", limit: 5, windowSeconds: 600 },
  "post-create": { name: "forum-post-create", limit: 20, windowSeconds: 600 },
  "post-edit": { name: "forum-post-edit", limit: 30, windowSeconds: 600 },
} satisfies Record<string, RateLimitRule>;

export type ForumRateLimitedOperation = keyof typeof RULES;

export async function enforceForumRateLimit(
  db: DbClient,
  operation: ForumRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}

/**
 * How long an author may edit their own post.
 *
 * Not a punishment and not a technical limit — it is what stops the
 * record from being rewritten under a conversation. A reply that quotes
 * or answers a post is meaningless if that post can become something else
 * a week later, and the person who answered it has no way to notice.
 *
 * Withdrawing stays available forever. Taking your words back is always
 * allowed; silently replacing them is not.
 */
export const EDIT_WINDOW_MINUTES = 30;

/** Posts per page in a thread. */
export const POSTS_PER_PAGE = 20;
/** Threads per page on a board. */
export const THREADS_PER_PAGE = 20;
