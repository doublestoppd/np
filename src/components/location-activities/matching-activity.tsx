import { prisma } from "@/server/db";
import { currentRun, dayView } from "@/server/modules/games/matching/run";
import { MatchingTable } from "@/components/games/matching-table";
import { MATCHING_DIFFICULTIES } from "@/lib/games/matching-rules";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * The Stonesetter's Table as a location activity. The rules live in
 * modules/games/matching; this resumes whichever run is in progress and
 * hands it to the board.
 *
 * A run in progress survives a closed tab, because the board is derived
 * from a seed and a flip log rather than held in a browser.
 */
export async function MatchingLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  const day = await dayView(prisma, { userId: viewer.id });
  // Resume whichever size is actually open, rather than assuming the
  // easiest: a player mid-way through the deep table wants that table.
  const runs = await Promise.all(
    MATCHING_DIFFICULTIES.map((difficulty) =>
      currentRun(prisma, { userId: viewer.id, difficulty }),
    ),
  );
  const run = runs.find((candidate) => candidate !== null) ?? null;

  const status: { status: PlayerStatus; label: string } = run
    ? { status: "IN_PROGRESS", label: "Table set" }
    : day.paidToday.length === MATCHING_DIFFICULTIES.length
      ? { status: "COMPLETED", label: "All three cleared today" }
      : day.paidToday.length > 0
        ? {
            status: "IN_PROGRESS",
            label: `${day.paidToday.length} of ${MATCHING_DIFFICULTIES.length} paid today`,
          }
        : { status: "AVAILABLE", label: "Open" };

  return (
    <ActivitySection
      headingId="activity-matching"
      title="The Stonesetter's Table"
      description="Cut stone in matched pairs, face down. Find them all in as few turns as you can — play as often as you like, but each size pays once a day."
      status={status}
    >
      <MatchingTable
        initial={{
          run,
          day,
          error: null,
          coinsAwarded: "0",
          alreadyPaidToday: false,
          nonce: 0,
        }}
      />
    </ActivitySection>
  );
}
