import { prisma } from "@/server/db";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { getWheelView } from "@/server/modules/daily/wheel/queries";
import { PrizeWheel } from "@/components/daily/prize-wheel";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/** Daily prize wheel as a location activity. */
export async function DailyWheelLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  const gameDate = currentGameDate();
  const view = await getWheelView(prisma, { userId: viewer.id, gameDate });
  if (!view) {
    // No configured wheel: the registry's isolation turns this into an
    // unavailable panel rather than a blank location.
    throw new Error("prize wheel is not configured");
  }

  const status: { status: PlayerStatus; label: string } = view.todaysSpin
    ? { status: "COMPLETED", label: "Spun today" }
    : view.available
      ? { status: "AVAILABLE", label: "Available today" }
      : { status: "UNAVAILABLE", label: "Resting today" };

  return (
    <ActivitySection
      headingId="activity-daily-wheel"
      title={view.wheelName}
      description="One spin a day. Coins, curiosities, or a valuable lesson in probability — resets at midnight GST."
      status={status}
    >
      <PrizeWheel view={view} />
    </ActivitySection>
  );
}
