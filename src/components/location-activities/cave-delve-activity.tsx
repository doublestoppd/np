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
      description="Ten rooms down, two ways on out of each, and one go a day. Wrong door and you're seen off — but you keep what you found."
      status={status}
    >
      <SunkenStair initial={view} />
    </ActivitySection>
  );
}
