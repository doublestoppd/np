import { prisma } from "@/server/db";
import { getFortuneView } from "@/server/modules/fortune/queries";
import { ensureFortuneJackpot } from "@/server/modules/fortune/jackpot";
import { FortuneMachine } from "@/components/fortune/fortune-machine";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * The Fortune Engine as a location activity (ADR-66).
 *
 * Always open, and deliberately never marked DONE: there is no daily limit
 * on a machine the player pays for out of their own pocket, so a badge
 * saying "finished for today" would be a lie about a thing that is simply
 * always there.
 */
export async function FortuneLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  // The pool row is created on first sight rather than seeded, so the
  // machine works on a fresh database without the seed knowing about it.
  await ensureFortuneJackpot(prisma);
  const view = await getFortuneView(prisma, { userId: viewer.id });

  const status: { status: PlayerStatus; label: string } = {
    status: "AVAILABLE",
    label: "Open",
  };

  return (
    <ActivitySection
      headingId="activity-fortune"
      title="The Fortune Engine"
      description="Three brass drums behind glass, and a pool of everybody's money that nobody has taken yet. It pays out about three coins in ten — the odds are on the machine, and they are not on your side."
      status={status}
    >
      <FortuneMachine view={view} />
    </ActivitySection>
  );
}
