import { prisma } from "@/server/db";
import { getBoardView } from "@/server/modules/requests/queries";
import { RequestBoard } from "@/components/requests/request-board";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/** Request board as a location activity. */
export async function RequestBoardLocationActivity({
  attachment,
  viewer,
}: LocationActivityRendererProps) {
  const view = await getBoardView(prisma, {
    userId: viewer.id,
    boardKey: attachment.activityKey,
  });
  if (!view) {
    throw new Error(`request board "${attachment.activityKey}" not found`);
  }

  const status: { status: PlayerStatus; label: string } = !view.available
    ? { status: "UNAVAILABLE", label: "Nothing posted" }
    : view.remainingToday === 0
      ? { status: "COMPLETED", label: "Done for today" }
      : view.completedToday > 0
        ? {
            status: "IN_PROGRESS",
            label: `${view.completedToday}/${view.dailyLimit} today`,
          }
        : { status: "AVAILABLE", label: "Available today" };

  return (
    <ActivitySection
      headingId="activity-request-board"
      title={view.name}
      description={view.description}
      status={status}
    >
      <RequestBoard view={view} />
    </ActivitySection>
  );
}
