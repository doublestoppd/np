import type { UserRole } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { DomainError } from "@/server/errors";
import { recordSecurityEvent } from "@/server/security/audit";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import { coinsToJSON } from "@/lib/money";

/**
 * Developer tooling for administrators (docs/operations.md).
 *
 * Everything here exists to make the game testable by hand: a person
 * clicking through a feature should not have to wait for a rate-limit
 * window to roll or for midnight to arrive. It is not a moderation
 * surface and it is not an economy console — it grants nothing that
 * playing would not, and every action is audited.
 */

/**
 * Refusals from the debug tools. Addressed to an administrator rather
 * than a player, so the message may name the real reason.
 */
export class DebugError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "DebugError";
  }
}

/** What a reset actually touched, by table. Zeroes are omitted by callers. */
export type ResetCounts = Record<string, number>;

export interface ResetResult {
  gameDate: GameDate;
  cleared: ResetCounts;
  /** Serialized coins clawed back by rewinding paid activities. */
  coinsRewound: string;
}

/**
 * Clears the things that say "not yet" without saying "you have already
 * been paid": rate-limit windows, idempotency keys, the random-event
 * cooldown, and per-toy play cooldowns.
 *
 * **No economy effect whatsoever.** Nothing here has ever paid anybody,
 * so clearing it cannot pay anybody twice. This is the one to reach for
 * while clicking around a feature, and it is safe to press repeatedly.
 */
export async function clearThrottles(
  db: DbClient,
  { actorId, targetUserId }: { actorId: string; targetUserId: string },
): Promise<ResetResult> {
  const cleared: ResetCounts = {};

  // Rate-limit keys are `${rule}:${subject}` and the subject is the user
  // id for every per-player rule (src/server/security/rate-limit.ts).
  cleared.rateLimitWindows = (
    await db.rateLimitWindow.deleteMany({
      where: { key: { endsWith: `:${targetUserId}` } },
    })
  ).count;

  cleared.idempotencyKeys = (
    await db.idempotencyKey.deleteMany({ where: { userId: targetUserId } })
  ).count;

  cleared.randomEventCooldown = (
    await db.randomEventState.deleteMany({ where: { userId: targetUserId } })
  ).count;

  // Toys go stale rather than being consumed, so the cooldown IS the
  // limit — deleting the row makes every toy novel again.
  cleared.toyCooldowns = (
    await db.petToyUse.deleteMany({ where: { pet: { ownerId: targetUserId } } })
  ).count;

  await audit(db, actorId, targetUserId, "throttles", cleared, 0n);
  return {
    gameDate: currentGameDate(),
    cleared: prune(cleared),
    coinsRewound: "0",
  };
}

/**
 * Rewinds today: every daily activity becomes available again.
 *
 * **This deliberately rewinds rather than re-grants.** Deleting a payout
 * row while leaving its coins would let an administrator mint currency by
 * pressing a button repeatedly — so anything that paid coins today is
 * undone properly: the completion row goes, its ledger row goes, and the
 * coins come back out of the wallet. Play the day again and you earn the
 * same coins again, with the ledger telling the truth throughout.
 *
 * If the wallet cannot absorb the rewind — the player has already spent
 * today's earnings — the whole thing is refused rather than clamped. A
 * clamp would silently break the reconciliation invariant that wallet
 * minus the sum of ledger deltas equals the starting balance, and a debug
 * tool that quietly corrupts the audit trail is worse than no tool.
 *
 * Items granted today are NOT taken back. They may have been eaten, sold,
 * or given away, and chasing them would mean unwinding other players'
 * inventories. So a rewind can leave a tester with two of a daily item;
 * that is a stated asymmetry rather than an oversight.
 */
export async function resetTodaysActivities(
  db: DbClient,
  {
    actorId,
    targetUserId,
    now = new Date(),
  }: { actorId: string; targetUserId: string; now?: Date },
): Promise<ResetResult> {
  const gameDate = currentGameDate({ now: () => now });
  const cleared: ResetCounts = {};

  const coinsRewound = await db.$transaction(async (tx) => {
    /**
     * Every coin-paying daily is rewound the same way: read the rows,
     * total what they paid, collect their ledger references, delete the
     * rows, delete those ledger rows, and debit the sum.
     *
     * Doing this for one activity and not the others was the first
     * version, and it made the whole feature dishonest — replaying the
     * wheel would have paid twice while replaying the slate did not.
     */
    const paid: bigint[] = [];
    const ledgerIds: string[] = [];
    const take = (
      rows: { coins: bigint; transactionId: string | null }[],
    ): void => {
      for (const row of rows) {
        paid.push(row.coins);
        if (row.transactionId) ledgerIds.push(row.transactionId);
      }
    };

    take(
      (
        await tx.sudokuAttempt.findMany({
          where: { userId: targetUserId, gameDate },
          select: { coins: true, transactionId: true },
        })
      ).map((row) => ({ coins: row.coins, transactionId: row.transactionId })),
    );
    take(
      (
        await tx.dailyWordResult.findMany({
          where: { userId: targetUserId, puzzle: { gameDate } },
          select: { rewardCoins: true, rewardTransactionId: true },
        })
      ).map((row) => ({
        coins: row.rewardCoins,
        transactionId: row.rewardTransactionId,
      })),
    );
    take(
      (
        await tx.dailyWheelSpin.findMany({
          where: { userId: targetUserId, gameDate },
          select: { awardedCoins: true, rewardTransactionId: true },
        })
      ).map((row) => ({
        coins: row.awardedCoins,
        transactionId: row.rewardTransactionId,
      })),
    );
    take(
      (
        await tx.requestCompletion.findMany({
          where: { userId: targetUserId, gameDate },
          select: { rewardCoins: true, transactionId: true },
        })
      ).map((row) => ({
        coins: row.rewardCoins,
        transactionId: row.transactionId,
      })),
    );
    take(
      (
        await tx.sortingPayout.findMany({
          where: { dailyBest: { userId: targetUserId, gameDate } },
          select: { coins: true, transactionId: true },
        })
      ).map((row) => ({ coins: row.coins, transactionId: row.transactionId })),
    );
    take(
      (
        await tx.matchingPayout.findMany({
          where: { userId: targetUserId, gameDate },
          select: { coins: true, transactionId: true },
        })
      ).map((row) => ({ coins: row.coins, transactionId: row.transactionId })),
    );
    take(
      (
        await tx.lanternSearch.findMany({
          where: { userId: targetUserId, hunt: { gameDate } },
          select: { rewardCoins: true, rewardTransactionId: true },
        })
      ).map((row) => ({
        coins: row.rewardCoins,
        transactionId: row.rewardTransactionId,
      })),
    );
    take(
      (
        await tx.randomEventOccurrence.findMany({
          where: { userId: targetUserId, gameDate },
          select: { coinsAwarded: true, transactionId: true },
        })
      ).map((row) => ({
        coins: row.coinsAwarded,
        transactionId: row.transactionId,
      })),
    );

    const rewound = paid.reduce((total, coins) => total + coins, 0n);

    // ---- Payouts before the runs and rows they reference (Restrict) ----
    cleared.sudokuAttempts = (
      await tx.sudokuAttempt.deleteMany({
        where: { userId: targetUserId, gameDate },
      })
    ).count;
    cleared.matchingPayouts = (
      await tx.matchingPayout.deleteMany({
        where: { userId: targetUserId, gameDate },
      })
    ).count;
    cleared.matchingRuns = (
      await tx.matchingRun.deleteMany({
        where: { userId: targetUserId, gameDate },
      })
    ).count;
    cleared.sortingPayouts = (
      await tx.sortingPayout.deleteMany({
        where: { dailyBest: { userId: targetUserId, gameDate } },
      })
    ).count;
    cleared.sortingDailyBests = (
      await tx.sortingDailyBest.deleteMany({
        where: { userId: targetUserId, gameDate },
      })
    ).count;
    cleared.sortingRuns = (
      await tx.sortingRun.deleteMany({
        where: { userId: targetUserId, gameDate },
      })
    ).count;

    // The lantern's looks hang off the search.
    const searchIds = (
      await tx.lanternSearch.findMany({
        where: { userId: targetUserId, hunt: { gameDate } },
        select: { id: true },
      })
    ).map((search) => search.id);
    if (searchIds.length > 0) {
      cleared.lanternLooks = (
        await tx.lanternLook.deleteMany({
          where: { searchId: { in: searchIds } },
        })
      ).count;
    }
    cleared.lanternSearches = (
      await tx.lanternSearch.deleteMany({ where: { id: { in: searchIds } } })
    ).count;

    cleared.wordResults = (
      await tx.dailyWordResult.deleteMany({
        where: { userId: targetUserId, puzzle: { gameDate } },
      })
    ).count;
    cleared.wheelSpins = (
      await tx.dailyWheelSpin.deleteMany({
        where: { userId: targetUserId, gameDate },
      })
    ).count;
    cleared.foodClaims = (
      await tx.dailyFoodClaim.deleteMany({
        where: { userId: targetUserId, gameDate },
      })
    ).count;
    cleared.requestCompletions = (
      await tx.requestCompletion.deleteMany({
        where: { userId: targetUserId, gameDate },
      })
    ).count;
    cleared.forageFinds = (
      await tx.forageFind.deleteMany({
        where: { userId: targetUserId, gameDate },
      })
    ).count;
    cleared.fishCatches = (
      await tx.fishCatch.deleteMany({
        where: { userId: targetUserId, gameDate },
      })
    ).count;
    cleared.giveawayTakes = (
      await tx.giveawayTake.deleteMany({
        where: { takerId: targetUserId, gameDate },
      })
    ).count;
    cleared.randomEvents = (
      await tx.randomEventOccurrence.deleteMany({
        where: { userId: targetUserId, gameDate },
      })
    ).count;

    // Now the ledger rows those payouts pointed at, and the coins.
    if (ledgerIds.length > 0) {
      cleared.ledgerRows = (
        await tx.transaction.deleteMany({ where: { id: { in: ledgerIds } } })
      ).count;
    }
    if (rewound > 0n) {
      // Guarded, not clamped: refusing is the only option that leaves the
      // ledger honest.
      const debited = await tx.user.updateMany({
        where: { id: targetUserId, coins: { gte: rewound } },
        data: { coins: { decrement: rewound } },
      });
      if (debited.count === 0) {
        throw new DebugError(
          "REWIND_UNAFFORDABLE",
          "This player has already spent what today's activities paid, so the day cannot be rewound without inventing coins. Clear the throttles instead, or wait for midnight UTC.",
        );
      }
    }
    return rewound;
  });

  await audit(db, actorId, targetUserId, "today", cleared, coinsRewound);
  return {
    gameDate,
    cleared: prune(cleared),
    coinsRewound: coinsToJSON(coinsRewound),
  };
}

function prune(counts: ResetCounts): ResetCounts {
  return Object.fromEntries(
    Object.entries(counts).filter(([, value]) => value > 0),
  );
}

async function audit(
  db: DbClient,
  actorId: string,
  targetUserId: string,
  scope: "throttles" | "today",
  cleared: ResetCounts,
  coinsRewound: bigint,
): Promise<void> {
  const rows = Object.values(cleared).reduce((total, n) => total + n, 0);
  log.warn("admin.debug-reset", {
    actorId,
    targetUserId,
    scope,
    rows,
    coinsRewound: coinsToJSON(coinsRewound),
  });
  await recordSecurityEvent(db, {
    userId: actorId,
    type: "admin-action",
    severity: "warning",
    message: `Debug reset (${scope}) for ${targetUserId}: ${rows} row(s)`,
    metadata: {
      targetUserId,
      scope,
      rows,
      coinsRewound: coinsToJSON(coinsRewound),
      ...prune(cleared),
    },
  });
}

/**
 * A player's live limit state, for the screen that offers to clear it.
 *
 * Everything a tester actually wants to know before pressing a button:
 * who this is, what they are holding, and which of today's activities are
 * already spent. Read-only.
 */
export interface PlayerSnapshot {
  userId: string;
  username: string;
  role: UserRole;
  coins: string;
  gameDate: GameDate;
  createdAt: Date;
  pets: Array<{ name: string; species: string; insight: number }>;
  /** Live throttle rows, by rule name. */
  throttles: Array<{ rule: string; count: number; windowStart: Date }>;
  /** Which dailies are already used up today. */
  spentToday: Array<{ activity: string; detail: string }>;
}

export async function getPlayerSnapshot(
  db: DbClient,
  { username }: { username: string },
): Promise<PlayerSnapshot | null> {
  const user = await db.user.findFirst({
    where: { normalizedUsername: username.trim().toLowerCase() },
    include: { pets: { include: { species: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!user) {
    return null;
  }
  const gameDate = currentGameDate();

  const windows = await db.rateLimitWindow.findMany({
    where: { key: { endsWith: `:${user.id}` } },
    orderBy: { windowStart: "desc" },
    take: 40,
  });

  const [
    words,
    wheel,
    meals,
    requests,
    forage,
    fish,
    sorting,
    matching,
    slate,
    lantern,
    takes,
    events,
  ] = await Promise.all([
    db.dailyWordResult.count({ where: { userId: user.id, puzzle: { gameDate } } }),
    db.dailyWheelSpin.count({ where: { userId: user.id, gameDate } }),
    db.dailyFoodClaim.count({ where: { userId: user.id, gameDate } }),
    db.requestCompletion.count({ where: { userId: user.id, gameDate } }),
    db.forageFind.count({ where: { userId: user.id, gameDate } }),
    db.fishCatch.count({ where: { userId: user.id, gameDate } }),
    db.sortingDailyBest.count({ where: { userId: user.id, gameDate } }),
    db.matchingPayout.count({ where: { userId: user.id, gameDate } }),
    db.sudokuAttempt.count({ where: { userId: user.id, gameDate, status: "SOLVED" } }),
    db.lanternSearch.count({ where: { userId: user.id, hunt: { gameDate } } }),
    db.giveawayTake.count({ where: { takerId: user.id, gameDate } }),
    db.randomEventOccurrence.count({ where: { userId: user.id, gameDate } }),
  ]);

  const spentToday = [
    { activity: "Word puzzles", n: words, unit: "finished" },
    { activity: "Prize wheel", n: wheel, unit: "spun" },
    { activity: "Free meals and drinks", n: meals, unit: "claimed" },
    { activity: "Board requests", n: requests, unit: "delivered" },
    { activity: "Foraging", n: forage, unit: "searches" },
    { activity: "Fishing", n: fish, unit: "casts" },
    { activity: "Sorting bench", n: sorting, unit: "scored" },
    { activity: "Matching table", n: matching, unit: "paid" },
    { activity: "Morning slate", n: slate, unit: "solved" },
    { activity: "Lantern hunt", n: lantern, unit: "searched" },
    { activity: "Leaving shelf", n: takes, unit: "taken" },
    { activity: "Random events", n: events, unit: "fired" },
  ]
    .filter((row) => row.n > 0)
    .map((row) => ({ activity: row.activity, detail: `${row.n} ${row.unit}` }));

  return {
    userId: user.id,
    username: user.username,
    role: user.role,
    coins: coinsToJSON(user.coins),
    gameDate,
    createdAt: user.createdAt,
    pets: user.pets.map((pet) => ({
      name: pet.name,
      species: pet.species.name,
      insight: pet.insight,
    })),
    throttles: windows.map((window) => ({
      // Strip the user id back off: the rule name is the useful half.
      rule: window.key.slice(0, window.key.lastIndexOf(":")),
      count: window.count,
      windowStart: window.windowStart,
    })),
    spentToday,
  };
}
