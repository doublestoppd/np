import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getBoardPage } from "@/server/modules/forums/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { InlineNotice } from "@/components/ui/inline-notice";
import { GameTimestamp } from "@/components/forums/game-timestamp";
import { NewThreadForm } from "@/components/forums/new-thread-form";
import { Pager } from "@/components/forums/pager";
import { firstParam, type SearchParams } from "@/lib/search-params";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ boardSlug: string }>;
}): Promise<Metadata> {
  const { boardSlug } = await params;
  const board = await prisma.forumBoard.findUnique({
    where: { slug: boardSlug },
    select: { name: true },
  });
  return { title: board?.name ?? "Forums" };
}

/**
 * One board's threads.
 *
 * The composer is at the BOTTOM, under the list. A form above the
 * conversation is a form you have to scroll past to read anything, and on
 * a phone that is the whole first screen spent on a box most visits do
 * not use.
 */
export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ boardSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const { boardSlug } = await params;
  const query = await searchParams;
  const page = Number(firstParam(query.page) ?? "1");

  const board = await getBoardPage(prisma, {
    slug: boardSlug,
    role: user.role,
    page: Number.isFinite(page) ? page : 1,
  });
  if (!board) {
    notFound();
  }

  return (
    <>
      <BackLink href="/forums">All boards</BackLink>
      <PageHeader title={board.name} description={board.description} />

      <FeedbackBanner
        notice={firstParam(query.notice)}
        error={firstParam(query.error)}
      />

      {!board.active && (
        <InlineNotice tone="info" className="mb-3" plain>
          This board is closed to new threads. Everything already here stays
          readable.
        </InlineNotice>
      )}

      {board.threads.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="💬"
            title="Nothing here yet"
            description={
              board.canPost
                ? "Be the first — there's a box at the bottom of this page."
                : "Nothing has been posted on this board yet."
            }
          />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {board.threads.map((thread) => (
            <li key={thread.id}>
              <Surface
                density="compact"
                className="relative transition-colors has-[a:hover]:border-border-strong has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  {thread.pinned && (
                    <span aria-label="Pinned" title="Pinned">
                      📌
                    </span>
                  )}
                  <h2 className="min-w-0 font-medium break-words text-text">
                    <Link
                      href={`/forums/t/${thread.id}`}
                      className="outline-none after:absolute after:inset-0 after:content-['']"
                    >
                      {thread.title}
                    </Link>
                  </h2>
                  {thread.locked && <Badge tone="neutral">Closed</Badge>}
                  {thread.visibility !== "VISIBLE" && (
                    <Badge tone="warning">
                      {thread.visibility === "REMOVED" ? "Removed" : "Withdrawn"}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {thread.authorUsername} ·{" "}
                  {thread.replyCount === 0
                    ? "no replies"
                    : `${thread.replyCount} ${thread.replyCount === 1 ? "reply" : "replies"}`}{" "}
                  · last <GameTimestamp at={thread.lastPostAt} />
                </p>
              </Surface>
            </li>
          ))}
        </ul>
      )}

      <Pager
        page={board.page}
        pageCount={board.pageCount}
        hrefFor={(next) => `/forums/${board.slug}?page=${next}`}
      />

      {board.canPost ? (
        <NewThreadForm boardSlug={board.slug} />
      ) : (
        <InlineNotice tone="info" className="mt-6" plain>
          Only the people running the game start threads here. You can reply
          to any of them.
        </InlineNotice>
      )}
    </>
  );
}
