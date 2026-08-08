import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getGroupedActivityDirectory } from "@/server/modules/directory/activity-directory";
import { ActivityDirectoryList } from "@/components/daily/activity-directory-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
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
 *
 * Grouped rather than one flat list. Fourteen rows in attachment order is
 * a wall: a free drink sat between two puzzles, and the only way to find
 * the thing you were after was to read all of it. The sections say what
 * KIND of thing each is, and within a section anything still open sorts
 * above anything finished — which is the question the page is opened to
 * answer.
 */
export default async function ActivitiesPage() {
  const user = await requireUser();
  const groups = await getGroupedActivityDirectory(prisma, { userId: user.id });

  return (
    <>
      <PageHeader
        title="Activities"
        description="What there is to do today. The daily things reset at midnight GST; gathering and the games of nerve are always open."
      />

      {groups.length === 0 ? (
        <EmptyState
          icon="🎲"
          title="Nothing on just now"
          description="Everything is resting just now. Check back after midnight GST."
        />
      ) : (
        groups.map((group) => (
          <section key={group.key} className="mt-6 first:mt-4">
            <SectionHeading
              id={`activities-${group.key}`}
              description={group.blurb}
            >
              {group.name}
            </SectionHeading>
            <div className="mt-3">
              <ActivityDirectoryList entries={group.entries} showDescription />
            </div>
          </section>
        ))
      )}

      <p className="mt-4 text-sm text-text-muted">
        More to do will appear here as the world grows. Past results live in
        your <TextLink href="/history/daily">activity history</TextLink>.
      </p>
    </>
  );
}
