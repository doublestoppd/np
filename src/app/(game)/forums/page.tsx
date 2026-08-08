import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { listBoards } from "@/server/modules/forums/queries";
import { canModerate } from "@/lib/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { TextLink } from "@/components/ui/text-link";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { GameTimestamp } from "@/components/forums/game-timestamp";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Forums" };

/**
 * The board index.
 *
 * Boards are stacked cards rather than a table: at 360px a table of
 * name / threads / last post either scrolls sideways or squeezes the only
 * column anybody reads. Each card is one tap target for the whole board.
 */
export default async function ForumsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const boards = await listBoards(prisma);

  return (
    <>
      <PageHeader
        title="Forums"
        description="Somewhere to talk about the game with the people playing it."
        actions={
          canModerate(user.role) ? (
            <TextLink href="/forums/moderation">Moderation</TextLink>
          ) : undefined
        }
      />

      <FeedbackBanner
        notice={firstParam(params.notice)}
        error={firstParam(params.error)}
      />

      <ul className="mt-4 flex flex-col gap-3">
        {boards.map((board) => (
          <li key={board.slug}>
            <Surface className="relative transition-colors has-[a:hover]:border-accent has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="font-display text-base font-semibold">
                  <Link
                    href={`/forums/${board.slug}`}
                    className="outline-none after:absolute after:inset-0 after:content-['']"
                  >
                    {board.name}
                  </Link>
                </h2>
                {board.staffOnly && <Badge tone="neutral">Announcements</Badge>}
              </div>
              <p className="mt-1 max-w-prose text-sm text-text-muted">
                {board.description}
              </p>
              <p className="mt-2 text-xs text-text-muted">
                {board.threadCount === 0
                  ? "Nothing here yet"
                  : `${board.threadCount} ${board.threadCount === 1 ? "thread" : "threads"}`}
                {board.lastPostAt && (
                  <>
                    {" · last "}
                    <GameTimestamp at={board.lastPostAt} />
                  </>
                )}
              </p>
            </Surface>
          </li>
        ))}
      </ul>
    </>
  );
}
