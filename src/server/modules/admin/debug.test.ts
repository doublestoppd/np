/**
 * The debug reset: what it clears, what it refuses, and the invariant it
 * will not break to be convenient.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  DebugError,
  clearThrottles,
  getPlayerSnapshot,
  resetTodaysActivities,
} from "./debug";
import { runReconciliation } from "./reconciliation";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { ensureTestSpecies } from "@test/factories/pets";

const prefix = fixturePrefix("debug");

describe.skipIf(!testDb)("admin debug reset (integration)", () => {
  const db = testDb as PrismaClient;
  let adminId: string;
  let userId: string;
  let username: string;
  const gameDate = currentGameDate();

  beforeEach(async () => {
    adminId = (
      await createTestUser(db, {
        username: `${prefix}_admin_${randomUUID().slice(0, 8)}`,
        role: "ADMIN",
      })
    ).id;
    const player = await createTestUser(db, {
      username: `${prefix}_p_${randomUUID().slice(0, 8)}`,
    });
    userId = player.id;
    username = player.username;
  });

  afterAll(async () => {
    await db.securityEvent.deleteMany({
      where: { message: { contains: "Debug reset" } },
    });
    await cleanupTestUsers(db, prefix);
    await db.$disconnect();
  });

  /** Puts a real rate-limit window in the way. */
  async function spendLimit(): Promise<void> {
    await enforceRateLimit(
      db,
      { name: `${prefix}-rule`, limit: 1, windowSeconds: 60 },
      userId,
      { userId },
    );
  }

  it("clears throttles without touching a single coin", async () => {
    await spendLimit();
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(
      await db.rateLimitWindow.count({ where: { key: { endsWith: `:${userId}` } } }),
    ).toBe(1);

    const result = await clearThrottles(db, {
      actorId: adminId,
      targetUserId: userId,
    });

    expect(result.cleared.rateLimitWindows).toBe(1);
    expect(result.coinsRewound).toBe("0");
    expect(
      await db.rateLimitWindow.count({ where: { key: { endsWith: `:${userId}` } } }),
    ).toBe(0);
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins);
  });

  it("leaves other players' throttles alone", async () => {
    const bystander = await createTestUser(db, {
      username: `${prefix}_by_${randomUUID().slice(0, 8)}`,
    });
    await enforceRateLimit(
      db,
      { name: `${prefix}-rule`, limit: 1, windowSeconds: 60 },
      bystander.id,
      { userId: bystander.id },
    );
    await spendLimit();

    await clearThrottles(db, { actorId: adminId, targetUserId: userId });

    expect(
      await db.rateLimitWindow.count({
        where: { key: { endsWith: `:${bystander.id}` } },
      }),
    ).toBe(1);
  });

  it("audits every reset, loudly", async () => {
    await clearThrottles(db, { actorId: adminId, targetUserId: userId });
    const events = await db.securityEvent.findMany({
      where: { userId: adminId, type: "admin-action" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.severity).toBe("warning");
    expect(events[0]?.message).toContain("Debug reset (throttles)");
  });

  /**
   * The invariant this feature exists to not break: a rewind takes the
   * coins back, so pressing the button twice cannot mint currency.
   */
  it("rewinds a paid daily rather than re-granting it", async () => {
    const start = await db.user.findUniqueOrThrow({ where: { id: userId } });
    // A solved slate, paid the way the real thing pays.
    await db.sudokuPuzzle.upsert({
      where: { gameDate },
      create: {
        gameDate,
        givens: ".".repeat(81),
        solution: "1".repeat(81),
        difficulty: "medium",
      },
      update: {},
    });
    const ledger = await recordLedger(db, {
      userId,
      type: "SUDOKU_REWARD",
      coinsDelta: 420n,
      note: "fixture",
    });
    await creditCoins(db, { userId, amount: 420n });
    await db.sudokuAttempt.create({
      data: {
        userId,
        gameDate,
        entries: "1".repeat(81),
        status: "SOLVED",
        solvedAt: new Date(),
        solveSeconds: 30,
        coins: 420n,
        transactionId: ledger.id,
      },
    });
    const paid = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(paid.coins).toBe(start.coins + 420n);

    const result = await resetTodaysActivities(db, {
      actorId: adminId,
      targetUserId: userId,
    });

    expect(result.coinsRewound).toBe("420");
    expect(result.cleared.sudokuAttempts).toBe(1);
    // Back exactly where we started: the coins, the attempt, and the
    // ledger row are all gone together.
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(start.coins);
    expect(await db.sudokuAttempt.count({ where: { userId } })).toBe(0);
    expect(await db.transaction.count({ where: { id: ledger.id } })).toBe(0);
  });

  it("refuses a rewind the player can no longer afford, changing nothing", async () => {
    await db.sudokuPuzzle.upsert({
      where: { gameDate },
      create: {
        gameDate,
        givens: ".".repeat(81),
        solution: "1".repeat(81),
        difficulty: "medium",
      },
      update: {},
    });
    const ledger = await recordLedger(db, {
      userId,
      type: "SUDOKU_REWARD",
      coinsDelta: 420n,
      note: "fixture",
    });
    await creditCoins(db, { userId, amount: 420n });
    await db.sudokuAttempt.create({
      data: {
        userId,
        gameDate,
        entries: "1".repeat(81),
        status: "SOLVED",
        solvedAt: new Date(),
        solveSeconds: 30,
        coins: 420n,
        transactionId: ledger.id,
      },
    });
    // Spend the lot, and then some.
    await db.user.update({ where: { id: userId }, data: { coins: 10n } });

    const error = await resetTodaysActivities(db, {
      actorId: adminId,
      targetUserId: userId,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DebugError);
    expect((error as DebugError).code).toBe("REWIND_UNAFFORDABLE");

    // Refused whole: clamping would have left the ledger lying.
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(10n);
    expect(await db.sudokuAttempt.count({ where: { userId } })).toBe(1);
    expect(await db.transaction.count({ where: { id: ledger.id } })).toBe(1);
  });

  it("leaves reconciliation clean after a rewind", async () => {
    await db.sudokuPuzzle.upsert({
      where: { gameDate },
      create: {
        gameDate,
        givens: ".".repeat(81),
        solution: "1".repeat(81),
        difficulty: "medium",
      },
      update: {},
    });
    const ledger = await recordLedger(db, {
      userId,
      type: "SUDOKU_REWARD",
      coinsDelta: 420n,
      note: "fixture",
    });
    await creditCoins(db, { userId, amount: 420n });
    await db.sudokuAttempt.create({
      data: {
        userId,
        gameDate,
        entries: "1".repeat(81),
        status: "SOLVED",
        solvedAt: new Date(),
        solveSeconds: 30,
        coins: 420n,
        transactionId: ledger.id,
      },
    });

    await resetTodaysActivities(db, { actorId: adminId, targetUserId: userId });

    // The reward row went with the attempt, so nothing is left orphaned —
    // which is the whole reason the rewind deletes the ledger row.
    expect(await runReconciliation(db, { userIds: [userId] })).toEqual([]);
  });

  it("reports what is currently in the way", async () => {
    const species = await ensureTestSpecies(db, `${prefix}-species`);
    await db.pet.create({
      data: { name: "Fixture", ownerId: userId, speciesId: species.id },
    });
    await spendLimit();

    const snapshot = await getPlayerSnapshot(db, { username });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.username).toBe(username);
    expect(snapshot?.pets).toHaveLength(1);
    expect(snapshot?.throttles.some((row) => row.rule.includes(prefix))).toBe(true);
    // The rule name is shown; the user id is stripped back off it.
    expect(snapshot?.throttles.every((row) => !row.rule.includes(userId))).toBe(true);
  });

  it("returns nothing for an account that does not exist", async () => {
    expect(await getPlayerSnapshot(db, { username: "nobody-at-all" })).toBeNull();
  });
});
