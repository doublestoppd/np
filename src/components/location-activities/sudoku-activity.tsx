import { prisma } from "@/server/db";
import { getSudokuView } from "@/server/modules/games/sudoku/attempt";
import { MorningSlate } from "@/components/games/morning-slate";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * The Morning Slate as a location activity. The rules live in
 * modules/games/sudoku; this reads today's grid and the viewer's working.
 *
 * Rendering this page is what chalks the day's grid if nobody has looked
 * yet — the generation is lazy and races safely under the primary key
 * (ADR-51), so there is no scheduler to keep running for it.
 */
export async function SudokuLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  const view = await getSudokuView(prisma, { userId: viewer.id });
  const started = view.grid !== view.givens;

  const status: { status: PlayerStatus; label: string } = view.solved
    ? { status: "COMPLETED", label: "Finished today" }
    : started
      ? { status: "IN_PROGRESS", label: "Part done" }
      : { status: "AVAILABLE", label: "Chalked" };

  return (
    <ActivitySection
      headingId="activity-sudoku"
      title="The Morning Slate"
      description="Nine by nine, chalked fresh at first light. Everyone in the valley works the same one, and it pays once a day."
      status={status}
    >
      <MorningSlate initial={view} />
    </ActivitySection>
  );
}
