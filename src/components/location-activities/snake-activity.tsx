import { prisma } from "@/server/db";
import { getArcadeDay } from "@/server/modules/games/arcade/run";
import { SnakeGame } from "@/components/games/arcade/snake-game";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * The Long Grass as a location activity (ADR-62).
 *
 * Read-only on render, like the other two: a run is what the wall-clock
 * check is measured from, so opening one must be a deliberate act rather
 * than a side effect of reading the page.
 */
export async function SnakeLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  const day = await getArcadeDay(prisma, { userId: viewer.id, game: "SNAKE" });

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
      headingId="activity-snake"
      title="The Long Grass"
      description="Something is moving through the marram, and it is hungry. Play as much as you like; three runs a day are yours to cash in, and you pick which."
      status={status}
    >
      <SnakeGame
        claimsUsed={day.claimsUsed}
        claimsPerDay={day.claimsPerDay}
        coinsToday={day.coinsToday}
        bestEver={day.bestEver}
        pending={day.pending}
      />
    </ActivitySection>
  );
}
