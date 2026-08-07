import { prisma } from "@/server/db";
import { getSlotMachineView } from "@/server/modules/slots/queries";
import { TumblehouseDrums } from "@/components/games/tumblehouse-drums";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * The Tumblehouse drums as a location activity. The rules live in
 * modules/slots; this reads which tokens the player is holding and hands
 * the whole ladder to the machine.
 *
 * Every tier is shown whether or not the player has one, because the
 * point of a five-tier machine is being able to see what the tokens you
 * do not have would do.
 */
export async function SlotMachineLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  const view = await getSlotMachineView(prisma, { userId: viewer.id });
  const held = view.tokens.reduce((total, token) => total + token.owned, 0);

  const status: { status: PlayerStatus; label: string } =
    view.tokens.length === 0
      ? { status: "UNAVAILABLE", label: "Shut" }
      : held > 0
        ? {
            status: "AVAILABLE",
            label: held === 1 ? "One token" : `${held} tokens`,
          }
        : { status: "SOLD_OUT", label: "No token" };

  return (
    <ActivitySection
      headingId="activity-slots"
      title="The Drums"
      description="Three drums, one lever, and a token to work it. Three of a face pays what that face is worth; the house does not say how often that happens."
      status={status}
    >
      <TumblehouseDrums view={view} />
    </ActivitySection>
  );
}
