import { prisma } from "@/server/db";
import { currentRun, dayView } from "@/server/modules/games/sorting/run";
import { SortingBench } from "@/components/games/sorting-bench";
import { getDailyTop } from "@/server/modules/scoreboards/daily";
import { TodaysBest } from "@/components/scoreboards/todays-best";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * The Sorting Bench as a location activity. The rules live in
 * modules/games/sorting; this loads the run in progress (if any) and the
 * day's standing, and hands both to the board.
 *
 * A run in progress is resumed rather than restarted: the board is
 * derived from a seed and a move log, so it survives a closed tab.
 */
export async function SortingBenchLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  const [run, day, board] = await Promise.all([
    currentRun(prisma, { userId: viewer.id }),
    dayView(prisma, { userId: viewer.id }),
    // Today's three best, shown at the foot of the card (ADR-67). The
    // bench already keeps one best per player per day, so this is the one
    // board that is a plain read rather than an aggregate.
    getDailyTop(prisma, { game: "SORTING_BENCH", viewerId: viewer.id }),
  ]);

  const status: { status: PlayerStatus; label: string } = run
    ? { status: "IN_PROGRESS", label: "Run in progress" }
    : day.nextTierScore === null
      ? { status: "COMPLETED", label: "Top of the day" }
      : day.bestScore > 0
        ? { status: "IN_PROGRESS", label: `Best today ${day.bestScore}` }
        : { status: "AVAILABLE", label: "Open" };

  return (
    <ActivitySection
      headingId="activity-sorting-bench"
      title="The Sorting Bench"
      description="Recovered things come up off the flats one at a time and have to go somewhere. Play as often as you like — only your best of the day earns anything."
      status={status}
    >
      <SortingBench
        initial={{
          run,
          day,
          error: null,
          coinsAwarded: "0",
          nonce: 0,
        }}
      />
      <TodaysBest
        board={board}
        attempt="board"
        headingId="todays-best-sorting-bench"
      />
    </ActivitySection>
  );
}
