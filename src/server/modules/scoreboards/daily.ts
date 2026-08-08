import type { ArcadeGame } from "@prisma/client";
import type { DbReader } from "@/server/db";
import { systemClock, type Clock } from "@/server/clock";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { ARCADE_GAMES } from "@/server/modules/games/arcade/config";

/**
 * Today's three best scores at a game, with names (ADR-67).
 *
 * **This reverses a standing product rule.** CLAUDE.md said personal
 * records were private and that the game never ranks one player against
 * another; the rule now applies to everything EXCEPT these boards, and the
 * reasoning is in ADR-67. What is still private is listed there and it is
 * most of what was private before — wealth, holdings, how often anybody
 * plays, and every record older than today.
 *
 * Three deliberate limits, because a leaderboard is easy to make worse:
 *
 * - **Three names, not a ladder.** Nobody is shown their position in a
 *   long list, so there is no rank to grind and no rank to lose.
 * - **Today only.** It empties every midnight, so a great score is a good
 *   day rather than a permanent fixture somebody has to beat to matter.
 * - **One row per player.** Their best, not their attempts, so nobody can
 *   crowd the board out by playing more than everyone else.
 *
 * Read-only, cross-domain, no writes — the same shape as
 * `modules/directory` and `modules/trophies`, for the same reason.
 */

/** The games a daily board is meaningful for. See `SKIPPED` below. */
export type ScoreboardGame = ArcadeGame | "SORTING_BENCH";

/**
 * The games deliberately WITHOUT a board, and why. Not an oversight, and
 * written down so it does not get quietly "fixed":
 *
 * - **The matching game** deals three difficulties. One board across them
 *   would rank a player who took the gentle board above one who took the
 *   deep one, which is not a comparison anybody asked to be in.
 * - **Sudoku** gives each player a grid from their own band, so a fast
 *   time on an easier grid would outrank a slow one on a harder grid.
 * - **The daily word** is scored by guesses used, where fewer is better,
 *   and a two-guess solve is mostly luck about the opening word.
 * - **The Sunken Stair** and **the Fortune Engine** pay by chance. A board
 *   of those ranks luck, and calling that a high score is a lie about what
 *   the player did.
 *
 * The common thread: a board is only honest when everybody on it was
 * given the same problem and beat it by playing better.
 */
export const SKIPPED_GAMES = [
  "MATCHING_GAME",
  "SUDOKU",
  "DAILY_WORD",
  "CAVE_DELVE",
  "FORTUNE_ENGINE",
] as const;

export interface ScoreboardRow {
  /** 1, 2 or 3. */
  place: number;
  username: string;
  score: number;
  /** True for the player reading it, so their own row can be marked. */
  isViewer: boolean;
}

export interface Scoreboard {
  rows: ScoreboardRow[];
  /** Singular and plural, e.g. ["wall", "walls"]. */
  unit: [string, string];
}

const HOW_MANY = 3;

const SORTING_UNIT: [string, string] = ["point", "points"];

/**
 * The top three at one game today.
 *
 * Grouped by player and taking each one's maximum, so the board is three
 * different people rather than one person's three best runs.
 */
export async function getDailyTop(
  db: DbReader,
  {
    game,
    viewerId,
    clock = systemClock,
  }: { game: ScoreboardGame; viewerId: string; clock?: Clock },
): Promise<Scoreboard> {
  const gameDate = currentGameDate(clock);
  const best =
    game === "SORTING_BENCH"
      ? await sortingBests(db, gameDate)
      : await arcadeBests(db, game, gameDate);

  if (best.length === 0) {
    return { rows: [], unit: unitFor(game) };
  }

  const players = await db.user.findMany({
    where: { id: { in: best.map((row) => row.userId) } },
    select: { id: true, username: true },
  });
  const nameOf = new Map(players.map((player) => [player.id, player.username]));

  return {
    unit: unitFor(game),
    rows: best.flatMap((row, index) => {
      const username = nameOf.get(row.userId);
      // A player deleted between the two queries simply is not on the
      // board, rather than appearing on it with no name.
      if (!username) return [];
      return [
        {
          place: index + 1,
          username,
          score: row.score,
          isViewer: row.userId === viewerId,
        },
      ];
    }),
  };
}

function unitFor(game: ScoreboardGame): [string, string] {
  return game === "SORTING_BENCH" ? SORTING_UNIT : ARCADE_GAMES[game].unit;
}

async function arcadeBests(db: DbReader, game: ArcadeGame, gameDate: string) {
  const grouped = await db.arcadeRun.groupBy({
    by: ["userId"],
    where: {
      game,
      gameDate,
      // Only runs the server actually scored. A VOID run carries whatever
      // score it had when it was refused, and a refused run on a board
      // would be the one place cheating paid.
      status: "FINISHED",
      score: { gt: 0 },
    },
    _max: { score: true },
    orderBy: { _max: { score: "desc" } },
    take: HOW_MANY,
  });
  return grouped.map((row) => ({
    userId: row.userId,
    score: row._max.score ?? 0,
  }));
}

async function sortingBests(db: DbReader, gameDate: string) {
  // The bench already keeps one row per player per day, so this is a plain
  // read rather than an aggregate.
  const rows = await db.sortingDailyBest.findMany({
    where: { gameDate, bestScore: { gt: 0 } },
    orderBy: { bestScore: "desc" },
    take: HOW_MANY,
    select: { userId: true, bestScore: true },
  });
  return rows.map((row) => ({ userId: row.userId, score: row.bestScore }));
}
