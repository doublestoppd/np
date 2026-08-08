import type { DbClient } from "@/server/db";

/**
 * Everything the trophy catalogue is allowed to know about a player
 * (ADR-65), gathered once.
 *
 * The shape is deliberate. Trophy criteria are the sort of thing that
 * multiplies — one per activity, and more whenever an activity is added —
 * and the obvious implementation gives each trophy its own query and its
 * own idea of what "completed" means. Twenty-six trophies then means
 * twenty-six chances to count something subtly differently from the game
 * that produced it.
 *
 * So the counting happens HERE, once, in one place that can be read
 * top-to-bottom and checked against the schema; and a trophy is a pure
 * predicate over the result. That makes every criterion testable without a
 * database, and it means the cost of the whole catalogue is this one pass
 * rather than one pass per trophy.
 *
 * **This module reads other domains' tables directly**, which is otherwise
 * not done. It is a read-only projection with no writes and no rules — the
 * same shape as `modules/directory` — and the alternative, a query on
 * every domain module for the benefit of trophies, would put a trophy
 * concern inside twenty other modules. Nothing here may write, and nothing
 * outside may import it to decide anything but a trophy.
 */
export interface TrophyFacts {
  /** Daily word: puzzles solved, and those solved in two guesses or fewer. */
  wordSolved: number;
  wordSolvedSharp: number;
  /** Prize wheel spins taken. */
  wheelSpins: number;
  /** Community meals and free drinks claimed. */
  mealsClaimed: number;
  drinksClaimed: number;
  /** Wandering lantern: hunts where it was found. */
  lanternsFound: number;
  /** Gathering: finds brought back, and distinct kinds of fish landed. */
  forageFinds: number;
  fishKinds: number;
  /** Puzzles. */
  sudokuSolved: number;
  sudokuSolvedClean: number;
  matchingDeepCompleted: number;
  sortingCompleted: number;
  /** Nerve and chance. */
  caveCleared: number;
  scratchWins: number;
  slotWins: number;
  /** Arcade: the best the server ever scored, per game. */
  bestPaperBird: number;
  bestTreeClimb: number;
  bestSnake: number;
  /** Commerce and community. */
  requestsCompleted: number;
  shopSales: number;
  npcPurchases: number;
  giveawaysLeft: number;
  /** The Fortune Engine: the biggest single payout they have taken. */
  bestFortuneWin: number;
  /** Companions and home. */
  bestBond: number;
  ailmentsTreated: number;
  booksRead: number;
  delightsFound: number;
  hollowPlacements: number;
}

/** The bond a companion reaches at the top band. See pets/bond.ts. */
export const INSEPARABLE_BOND = 1_000;

/** Content slugs for the two daily food pools. */
const MEAL_POOL = "hearth-and-ladle";
const DRINK_POOL = "warming-hut";

export async function gatherTrophyFacts(
  db: DbClient,
  userId: string,
): Promise<TrophyFacts> {
  const pet = { pet: { ownerId: userId } };

  const [
    wordSolved,
    wordSolvedSharp,
    wheelSpins,
    mealsClaimed,
    drinksClaimed,
    lanternsFound,
    forageFinds,
    fishKinds,
    sudokuSolved,
    sudokuSolvedClean,
    matchingDeepCompleted,
    sortingCompleted,
    caveCleared,
    scratchWins,
    slotWins,
    arcadeBests,
    requestsCompleted,
    shopSales,
    npcPurchases,
    giveawaysLeft,
    bestBond,
    ailmentsTreated,
    booksRead,
    delightsFound,
    hollowPlacements,
    bestFortuneWin,
  ] = await Promise.all([
    db.dailyWordResult.count({ where: { userId, status: "SOLVED" } }),
    db.dailyWordResult.count({
      where: { userId, status: "SOLVED", attemptsUsed: { lte: 2 } },
    }),
    db.dailyWheelSpin.count({ where: { userId } }),
    db.dailyFoodClaim.count({ where: { userId, pool: { slug: MEAL_POOL } } }),
    db.dailyFoodClaim.count({ where: { userId, pool: { slug: DRINK_POOL } } }),
    db.lanternSearch.count({ where: { userId, status: "FOUND" } }),
    db.forageFind.count({ where: { userId } }),
    // Distinct KINDS, not catches: FishRecord holds one row per item the
    // player has ever landed, which is exactly the question.
    db.fishRecord.count({ where: { userId } }),
    db.sudokuAttempt.count({ where: { userId, status: "SOLVED" } }),
    db.sudokuAttempt.count({
      where: { userId, status: "SOLVED", wrongChecks: 0 },
    }),
    db.matchingRun.count({
      where: { userId, status: "COMPLETED", difficulty: "DEEP" },
    }),
    db.sortingRun.count({ where: { userId, status: "COMPLETED" } }),
    db.caveDelve.count({ where: { userId, status: "CLEARED" } }),
    db.scratchResult.count({ where: { userId, won: true } }),
    db.slotSpin.count({ where: { userId, won: true } }),
    // One grouped query rather than three: the arcade games differ only
    // by a column.
    db.arcadeRun.groupBy({
      by: ["game"],
      where: { userId, status: "FINISHED" },
      _max: { score: true },
    }),
    db.requestCompletion.count({ where: { userId } }),
    // Sales and purchases are read off the ledger rather than off listings
    // and stock, because the ledger is the record that cannot disagree
    // with the wallet — a cancelled listing or a restocked shelf leaves
    // no trace there, and neither should count.
    db.transaction.count({ where: { userId, type: "PLAYER_SALE" } }),
    db.transaction.count({ where: { userId, type: "NPC_PURCHASE" } }),
    db.giveawayOffering.count({ where: { donorId: userId } }),
    db.pet.aggregate({ where: { ownerId: userId }, _max: { bond: true } }),
    db.petAilment.count({ where: { ...pet, treatedAt: { not: null } } }),
    // Distinct books, not sittings: PetBookReading is one row per book per
    // companion, and reading the same one twice is not two books.
    db.petBookReading.findMany({ where: pet, select: { itemId: true } }),
    db.petDelight.findMany({ where: pet, select: { itemId: true } }),
    db.hollowPlacement.count({
      where: { scene: { hollow: { userId } } },
    }),
    // Coins, so it comes back as a bigint and is narrowed below. The
    // trophy wants a threshold, not the exact figure.
    db.fortuneSpin.aggregate({ where: { userId }, _max: { payout: true } }),
  ]);

  const bestOf = (game: string) =>
    arcadeBests.find((row) => row.game === game)?._max.score ?? 0;

  return {
    wordSolved,
    wordSolvedSharp,
    wheelSpins,
    mealsClaimed,
    drinksClaimed,
    lanternsFound,
    forageFinds,
    fishKinds,
    sudokuSolved,
    sudokuSolvedClean,
    matchingDeepCompleted,
    sortingCompleted,
    caveCleared,
    scratchWins,
    slotWins,
    bestPaperBird: bestOf("PAPER_BIRD"),
    bestTreeClimb: bestOf("TREE_CLIMB"),
    bestSnake: bestOf("SNAKE"),
    requestsCompleted,
    shopSales,
    npcPurchases,
    giveawaysLeft,
    bestBond: bestBond._max.bond ?? 0,
    ailmentsTreated,
    // Distinct across every companion the player owns.
    booksRead: new Set(booksRead.map((row) => row.itemId)).size,
    delightsFound: new Set(delightsFound.map((row) => row.itemId)).size,
    hollowPlacements,
    bestFortuneWin: Number(bestFortuneWin._max.payout ?? 0n),
  };
}
