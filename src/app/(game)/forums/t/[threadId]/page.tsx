import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getThreadPage } from "@/server/modules/forums/queries";
import { EDIT_WINDOW_MINUTES } from "@/server/modules/forums/config";
import { canModerate } from "@/lib/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Pager } from "@/components/forums/pager";
import { PostCard } from "@/components/forums/post-card";
import { ReplyForm } from "@/components/forums/reply-form";
import { ThreadModeratorBar } from "@/components/forums/thread-moderator-bar";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Thread" };

/**
 * One thread.
 *
 * Every control that acts on a post — edit, withdraw, report, and the
 * moderator's remove — lives on the post it acts on, inside a
 * `<details>`. At 360px a row of four buttons under every post is most of
 * the screen; folded away, the conversation is the page and the tools are
 * one tap from wherever you are.
 */
export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const { threadId } = await params;
  const query = await searchParams;
  const raw = firstParam(query.page);

  // "last" so a reply can land the reader on their own post without the
  // action needing to know how many pages there are.
  const requested = raw === "last" ? Number.MAX_SAFE_INTEGER : Number(raw ?? "1");

  const thread = await getThreadPage(prisma, {
    threadId,
    userId: user.id,
    role: user.role,
    page: Number.isFinite(requested) ? requested : 1,
    editWindowMinutes: EDIT_WINDOW_MINUTES,
  });
  if (!thread) {
    notFound();
  }

  const moderator = canModerate(user.role);

  return (
    <>
      <BackLink href={`/forums/${thread.boardSlug}`}>
        {thread.boardName}
      </BackLink>
      <PageHeader
        title={thread.title}
        description={`Started by ${thread.authorUsername}`}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {thread.pinned && <Badge tone="neutral">Pinned</Badge>}
            {thread.locked && <Badge tone="neutral">Closed</Badge>}
            {thread.visibility !== "VISIBLE" && (
              <Badge tone="warning">
                {thread.visibility === "REMOVED" ? "Removed" : "Withdrawn"}
              </Badge>
            )}
          </span>
        }
      />

      <FeedbackBanner
        notice={firstParam(query.notice)}
        error={firstParam(query.error)}
      />

      {thread.locked && (
        <InlineNotice tone="info" className="mb-3" plain>
          This thread is closed to new replies. Everything in it stays
          readable.
        </InlineNotice>
      )}

      <ol className="flex flex-col gap-3">
        {thread.posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            threadId={thread.id}
            threadLocked={thread.locked}
            isModerator={moderator}
          />
        ))}
      </ol>

      <Pager
        page={thread.page}
        pageCount={thread.pageCount}
        hrefFor={(next) => `/forums/t/${thread.id}?page=${next}`}
      />

      <span id="end" />

      {thread.canReply && (
        <ReplyForm threadId={thread.id} />
      )}

      {moderator && (
        <ThreadModeratorBar
          threadId={thread.id}
          locked={thread.locked}
          pinned={thread.pinned}
        />
      )}
    </>
  );
}
