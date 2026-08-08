import { prisma } from "@/server/db";
import { getDelveView } from "@/server/modules/cave/delve";
import { SunkenStair } from "@/components/games/sunken-stair";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * The Sunken Stair as a location activity (ADR-59).
 *
 * Read-only on render: looking at the cave never opens it. Going in is a
 * deliberate act, because it is the only one available today, and a page
 * visit that quietly spent it would be the worst possible way to find
 * that out.
 */
export async function CaveDelveLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  const view = await getDelveView(prisma, { userId: viewer.id });

  const status: { status: PlayerStatus; label: string } =
    view.status === "CLEARED"
      ? { status: "COMPLETED", label: "Reached the bottom" }
      : view.status === "TURNED_BACK"
        ? { status: "COMPLETED", label: "Been down today" }
        : view.status === "IN_PROGRESS"
          ? {
              status: "IN_PROGRESS",
              label: `${view.depth} of ${view.totalDepth} rooms`,
            }
          : { status: "AVAILABLE", label: "Open" };

  return (
    <ActivitySection
      headingId="activity-cave"
      title="The Sunken Stair"
      /* Deliberately not a summary of the panel below it. The card used to
         open with a sentence the first paragraph inside it then said again
         at greater length, so a player read the same rules twice before
         reaching the button. This says what the place IS; the panel says
         what happens. */
      description="Ten rooms cut down into the fell, and something at the bottom of them that was there first."
      status={status}
    >
      <SunkenStair initial={view} />
    </ActivitySection>
  );
}
