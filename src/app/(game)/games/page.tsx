import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getActivityDirectory } from "@/server/modules/directory/activity-directory";
import { ActivityDirectoryList } from "@/components/daily/activity-directory-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TextLink } from "@/components/ui/text-link";

export const metadata: Metadata = { title: "Games" };

/**
 * Everything playable today, in one place. The activities live at their
 * locations in the world — this page is a directory into them, so a
 * player looking for something to play never lands on a dead end. The list
 * is derived from the world's activity attachments, so attaching a new
 * activity to a location puts it here with no code change.
 */
export default async function GamesPage() {
  const user = await requireUser();
  const entries = await getActivityDirectory(prisma, { userId: user.id });

  return (
    <>
      <PageHeader
        title="Games"
        description="What there is to play today. Everything resets at midnight UTC."
      />

      {entries.length === 0 ? (
        <EmptyState
          icon="🎲"
          title="Nothing to play just now"
          description="Everything is resting just now. Check back after midnight UTC."
        />
      ) : (
        <ActivityDirectoryList entries={entries} showDescription />
      )}

      <p className="mt-4 text-sm text-text-muted">
        More to play will appear here as the world grows. Past results live
        in your <TextLink href="/history/daily">activity history</TextLink>.
      </p>
    </>
  );
}
