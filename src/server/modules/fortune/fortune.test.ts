import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { spinFortune } from "./spin";
import { getFortuneJackpot, ensureFortuneJackpot } from "./jackpot";
import { getFortuneView } from "./queries";
import { FortuneError } from "./errors";
import { JACKPOT_FEED_BPS, JACKPOT_MINIMUM, STAKES, TOP_STAKE } from "./config";
import { JACKPOT_SLUG } from "./config";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

/**
 * The Fortune Engine against a real database (ADR-66).
 *
 * The reels' arithmetic is settled exactly, without a database, in
 * lib/games/fortune/reels.test.ts. What needs one is the money: that a
 * stake is actually taken, that it is taken BEFORE anything is drawn, that
 * a pull the player cannot afford changes nothing at all, that the pool is
 * fed only by the stake that can win it, and that every coin moved has a
 * ledger row behind it.
 *
 * That last one is not a nicety. CI derives every wallet from its ledger
 * and compares; a coin that moves without a row is a reconciliation
 * failure, and this is a machine whose whole job is moving coins.
 */

const prefix = fixturePrefix("fortune");
const SMALL = STAKES[0] as bigint;

describe.skipIf(!testDb)("the fortune engine (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;

  beforeEach(async () => {
    userId = (
      await createTestUser(db, {
        username: `${prefix}_${randomUUID().slice(0, 8)}`,
      })
    ).id;
    // A purse deep enough to pull with, granted with a ledger row so
    // reconciliation stays honest about the fixture too.
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { coins: 100_000n },
      });
      await tx.transaction.create({
        data: {
          userId,
          type: "ADMIN_ADJUST",
          coinsDelta: 100_000n,
          note: "fortune test purse",
        },
      });
    });
    await ensureFortuneJackpot(db);
    // Each test starts from a known pool.
    await db.fortuneJackpot.updateMany({
      where: { slug: JACKPOT_SLUG },
      data: { pool: 0n },
    });
  });

  afterAll(async () => {
    await db.fortuneSpin.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await db.fortuneJackpot.updateMany({
      where: { slug: JACKPOT_SLUG },
      data: { pool: 0n, lastWonAt: null, lastWonBy: null },
    });
    await cleanupTestUsers(db, prefix);
  });

  it("takes the stake and records what the drums did", async () => {
    const before = (await db.user.findUniqueOrThrow({ where: { id: userId } }))
      .coins;

    const { result } = await spinFortune(db, {
      userId,
      stake: SMALL,
      idempotencyKey: randomUUID(),
    });

    expect(result.symbols).toHaveLength(3);
    expect(result.stake).toBe(SMALL.toString());

    const after = (await db.user.findUniqueOrThrow({ where: { id: userId } }))
      .coins;
    // Whatever the reels did, the arithmetic is exactly: minus the stake,
    // plus the payout. Nothing else moves.
    expect(after).toBe(before - SMALL + BigInt(result.payout));
    // And the balance the player is handed is the stored one.
    expect(result.balance).toBe(after.toString());

    const spin = await db.fortuneSpin.findFirstOrThrow({ where: { userId } });
    expect(spin.symbols.split(",")).toEqual(result.symbols);
    expect(spin.payout).toBe(BigInt(result.payout));
  });

  it("puts a ledger row behind every coin it moves", async () => {
    // Reconciliation derives the wallet from these; a payout without one
    // is a wallet that cannot be explained.
    const { result } = await spinFortune(db, {
      userId,
      stake: SMALL,
      idempotencyKey: randomUUID(),
    });

    const staked = await db.transaction.findMany({
      where: { userId, type: "FORTUNE_STAKE" },
    });
    expect(staked).toHaveLength(1);
    expect(staked[0]?.coinsDelta).toBe(-SMALL);

    const paid = await db.transaction.findMany({
      where: { userId, type: "FORTUNE_PRIZE" },
    });
    if (BigInt(result.payout) > 0n) {
      expect(paid).toHaveLength(1);
      expect(paid[0]?.coinsDelta).toBe(BigInt(result.payout));
    } else {
      // A losing pull writes no prize row at all, rather than a zero one.
      expect(paid).toHaveLength(0);
    }
  });

  it("refuses a stake that is not on the ladder", async () => {
    await expect(
      spinFortune(db, {
        userId,
        stake: 37n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(FortuneError);
    expect(await db.fortuneSpin.count({ where: { userId } })).toBe(0);
  });

  it("changes nothing when the player cannot afford it", async () => {
    // The stake is taken before anything is drawn, so a refusal here must
    // leave no spin, no ledger row and no pool contribution — the trap the
    // chits record, in a machine that costs money to pull.
    await db.user.update({ where: { id: userId }, data: { coins: 10n } });
    const poolBefore = await getFortuneJackpot(db);

    await expect(
      spinFortune(db, {
        userId,
        stake: TOP_STAKE,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(FortuneError);

    expect(await db.fortuneSpin.count({ where: { userId } })).toBe(0);
    expect(
      await db.transaction.count({ where: { userId, type: "FORTUNE_STAKE" } }),
    ).toBe(0);
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(10n);
    expect((await getFortuneJackpot(db)).standsAt).toBe(poolBefore.standsAt);
  });

  it("feeds the pool from the top stake only", async () => {
    const pool = async () =>
      (
        await db.fortuneJackpot.findUniqueOrThrow({
          where: { slug: JACKPOT_SLUG },
        })
      ).pool;

    await spinFortune(db, {
      userId,
      stake: SMALL,
      idempotencyKey: randomUUID(),
    });
    // A small stake cannot win the pool, so it does not pay into it.
    expect(await pool()).toBe(0n);

    const { result } = await spinFortune(db, {
      userId,
      stake: TOP_STAKE,
      idempotencyKey: randomUUID(),
    });
    // Unless that pull happened to take it, in which case the pool is
    // empty for a different reason entirely.
    if (!result.jackpot) {
      expect(await pool()).toBe((TOP_STAKE * JACKPOT_FEED_BPS) / 10_000n);
    }
  });

  it("never shows a pool below its floor", async () => {
    const view = await getFortuneJackpot(db);
    expect(BigInt(view.standsAt)).toBe(JACKPOT_MINIMUM);
    expect(view.atFloor).toBe(true);
  });

  it("replays a repeated pull instead of charging twice", async () => {
    const key = randomUUID();
    const before = (await db.user.findUniqueOrThrow({ where: { id: userId } }))
      .coins;

    const first = await spinFortune(db, {
      userId,
      stake: SMALL,
      idempotencyKey: key,
    });
    const second = await spinFortune(db, {
      userId,
      stake: SMALL,
      idempotencyKey: key,
    });

    expect(second.replayed).toBe(true);
    // The same drums, not a fresh spin — a double tap must not be a second
    // gamble at the same price.
    expect(second.result).toEqual(first.result);
    expect(await db.fortuneSpin.count({ where: { userId } })).toBe(1);
    const after = (await db.user.findUniqueOrThrow({ where: { id: userId } }))
      .coins;
    expect(after).toBe(before - SMALL + BigInt(first.result.payout));
  });

  it("pays the whole pool to a jackpot and empties it", async () => {
    // Three moons is 1 in 32,768, so it cannot be reached by pulling. The
    // pool's own behaviour is what needs proving, and that is reachable:
    // stock it, take it, and check both the payment and the reset.
    const { claimFortuneJackpot } = await import("./jackpot");
    await db.fortuneJackpot.updateMany({
      where: { slug: JACKPOT_SLUG },
      data: { pool: 400_000n },
    });

    const taken = await db.$transaction((tx) =>
      claimFortuneJackpot(tx, { userId, now: new Date() }),
    );
    expect(taken).toBe(400_000n);

    const after = await getFortuneJackpot(db);
    // Emptied, and back to advertising its floor rather than zero.
    expect(BigInt(after.standsAt)).toBe(JACKPOT_MINIMUM);
    expect(after.lastWonBy).not.toBeNull();
  });

  it("pays the floor, never nothing, when the pool is under it", async () => {
    const { claimFortuneJackpot } = await import("./jackpot");
    await db.fortuneJackpot.updateMany({
      where: { slug: JACKPOT_SLUG },
      data: { pool: 12n },
    });
    const taken = await db.$transaction((tx) =>
      claimFortuneJackpot(tx, { userId, now: new Date() }),
    );
    expect(taken).toBe(JACKPOT_MINIMUM);
  });

  it("shows the player their own pulls and nobody else's", async () => {
    const other = await createTestUser(db, {
      username: `${prefix}_${randomUUID().slice(0, 8)}`,
    });
    await db.user.update({ where: { id: other.id }, data: { coins: 10_000n } });
    await spinFortune(db, {
      userId: other.id,
      stake: SMALL,
      idempotencyKey: randomUUID(),
    });
    await spinFortune(db, {
      userId,
      stake: SMALL,
      idempotencyKey: randomUUID(),
    });

    const view = await getFortuneView(db, { userId });
    expect(view.recent).toHaveLength(1);
    expect(view.stakes).toEqual(STAKES.map((stake) => stake.toString()));
    expect(view.topStake).toBe(TOP_STAKE.toString());
  });
});
