import { prisma } from "@/server/db";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { getBoard, type BoardView } from "@/server/modules/daily/word/game";
import { WORD_DIFFICULTIES } from "@/server/modules/daily/word/config";
import type { WordDifficulty } from "@prisma/client";
import { WordGame } from "@/components/daily/word-game";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * Daily word challenge as a location activity. All rules stay in
 * modules/daily/word; this component loads the view models and renders the
 * board inside the shared activity frame.
 */
export async function DailyWordLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  const gameDate = currentGameDate();
  const loaded = await Promise.all(
    WORD_DIFFICULTIES.map((difficulty) =>
      getBoard(prisma, { userId: viewer.id, gameDate, difficulty }),
    ),
  );
  const boards = Object.fromEntries(
    WORD_DIFFICULTIES.map((difficulty, index) => [difficulty, loaded[index]!]),
  ) as Record<WordDifficulty, BoardView>;

  // A board is finished only when it is SOLVED or FAILED — a fresh board
  // is AVAILABLE, which is emphatically not "done".
  const finished = loaded.filter(
    (board) => board.status === "SOLVED" || board.status === "FAILED",
  ).length;
  const started = loaded.some((board) => board.attemptsUsed > 0);
  const status: { status: PlayerStatus; label: string } =
    finished === loaded.length
      ? { status: "COMPLETED", label: "Done for today" }
      : finished > 0 || started
        ? { status: "IN_PROGRESS", label: `${finished}/${loaded.length} done` }
        : { status: "AVAILABLE", label: "Available today" };

  return (
    <ActivitySection
      headingId="activity-daily-word"
      title="Today's word puzzles"
      description="Three puzzles a day — one word each. Five guesses per puzzle, fresh words at midnight GST. Solve for coins; missing costs nothing."
      status={status}
    >
      <WordGame boards={boards} />
    </ActivitySection>
  );
}
