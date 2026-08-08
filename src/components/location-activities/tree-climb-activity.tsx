import { prisma } from "@/server/db";
import { getArcadeDay } from "@/server/modules/games/arcade/run";
import { TreeClimbGame } from "@/components/games/arcade/tree-climb-game";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * The Paper Bird as a location activity (ADR-62).
 *
 * Read-only on render: looking at the game never opens a run. A run is a
 * deliberate act, because starting one is what the wall clock is measured
 * from — a page visit that quietly opened one would hand a player a run
 * that had already been running for however long they read the page.
 */
export async function TreeClimbLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  const day = await getArcadeDay(prisma, {
    userId: viewer.id,
    game: "TREE_CLIMB",
  });

  const status: { status: PlayerStatus; label: string } =
    day.claimsUsed >= day.claimsPerDay
      ? { status: "COMPLETED", label: "Three claimed today" }
      : day.claimsUsed > 0
        ? {
            status: "IN_PROGRESS",
            label: `${day.claimsUsed} of ${day.claimsPerDay} claimed`,
          }
        : { status: "AVAILABLE", label: "Open" };

  return (
    <ActivitySection
      headingId="activity-tree-climb"
      title="The Long Way Up"
      description="Up through the branches, as far as you can get. Play as much as you like; three runs a day are yours to cash in, and you pick which."
      status={status}
    >
      <TreeClimbGame
        claimsUsed={day.claimsUsed}
        claimsPerDay={day.claimsPerDay}
        coinsToday={day.coinsToday}
        bestEver={day.bestEver}
        pending={day.pending}
      />
    </ActivitySection>
  );
}
