import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getActivityDirectory } from "@/server/modules/directory/activity-directory";
import { ActivityDirectoryList } from "@/components/daily/activity-directory-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TextLink } from "@/components/ui/text-link";

export const metadata: Metadata = { title: "Activities" };

/**
 * Everything playable today, in one place. The activities live at their
 * locations in the world — this page is a directory into them, so a
 * player looking for something to play never lands on a dead end. The list
 * is derived from the world's activity attachments, so attaching a new
 * activity to a location puts it here with no code change.
 *
 * "Activities", not "Games", and the route matches. Half of what is listed
 * here is not a game in any sense a player would recognise — foraging, a
 * request board, a free drink, a walk to look at the lantern — and calling
 * the tab Games quietly told them the puzzles were the point and the rest
 * was filler. This is also the ONLY copy of the list: the home page
 * carried the same rows from the same query, which meant two places to
 * check and two places to be wrong.
 */
export default async function ActivitiesPage() {
  const user = await requireUser();
  const entries = await getActivityDirectory(prisma, { userId: user.id });

  return (
    <>
      <PageHeader
        title="Activities"
        description="What there is to do today. Everything resets at midnight GST."
      />

      {entries.length === 0 ? (
        <EmptyState
          icon="🎲"
          title="Nothing on just now"
          description="Everything is resting just now. Check back after midnight GST."
        />
      ) : (
        <ActivityDirectoryList entries={entries} showDescription />
      )}

      <p className="mt-4 text-sm text-text-muted">
        More to do will appear here as the world grows. Past results live in
        your <TextLink href="/history/daily">activity history</TextLink>.
      </p>
    </>
  );
}
