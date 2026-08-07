/**
 * Scratch cards: the draw, the ledger, and the guardrails that keep a game
 * of chance from becoming a faucet (ADR-46).
 *
 * Runs against a real PostgreSQL database with its own fixture card, so
 * the distribution assertions are not at the mercy of authored content.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { scratchCard } from "./scratch";
import { getScratchOdds, getScratchHistory } from "./queries";
import { ScratchError } from "./errors";
import { SCRATCH_TOTAL_WEIGHT } from "./config";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";

const prefix = fixturePrefix("scratch");

async function expectScratchError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ScratchError);
  expect((error as ScratchError).scratchCode).toBe(code);
}

describe.skipIf(!testDb)("scratch cards (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let cardId: string;
  let prizeItemId: string;
  let coinPrizeId: string;
  let itemPrizeId: string;

  const scratch = (
    overrides: { key?: string; itemId?: string; now?: Date } = {},
  ) =>
    scratchCard(db, {
      userId,
      itemId: overrides.itemId ?? cardId,
      idempotencyKey: overrides.key ?? randomUUID(),
      ...(overrides.now ? { now: overrides.now } : {}),
    });

  /** Puts `n` cards in the satchel. */
  async function give(n: number, itemId = cardId): Promise<void> {
    await db.inventoryEntry.upsert({
      where: { userId_itemId: { userId, itemId } },
      create: { userId, itemId, quantity: n },
      update: { quantity: n },
    });
  }

  async function cleanFixtures(): Promise<void> {
    await db.scratchResult.deleteMany({
      where: { prize: { card: { item: { slug: { startsWith: prefix } } } } },
    });
    await db.scratchPrize.deleteMany({
      where: { card: { item: { slug: { startsWith: prefix } } } },
    });
    await db.scratchCard.deleteMany({
      where: { item: { slug: { startsWith: prefix } } },
    });
  }

  beforeEach(async () => {
    await cleanFixtures();
    userId = (
      await createTestUser(db, { username: `${prefix}_${randomUUID().slice(0, 8)}` })
    ).id;

    cardId =
      cardId ??
      (
        await createTestItem(db, {
          slug: `${prefix}-card`,
          type: "SCRATCH_CARD",
          price: 100n,
        })
      ).id;
    prizeItemId =
      prizeItemId ??
      (await createTestItem(db, { slug: `${prefix}-prize`, price: 40n })).id;

    await db.scratchCard.create({ data: { itemId: cardId, tier: 1 } });
    // A deliberately lopsided table: 60% coins, 40% item. Enough of a gap
    // that a broken draw shows up in a few hundred pulls without needing
    // tens of thousands.
    coinPrizeId = (
      await db.scratchPrize.create({
        data: {
          cardItemId: cardId,
          label: "Some coins",
          kind: "COINS",
          coinAmount: 25n,
          weight: 6000,
          displayOrder: 0,
        },
      })
    ).id;
    itemPrizeId = (
      await db.scratchPrize.create({
        data: {
          cardItemId: cardId,
          label: "A trinket",
          kind: "ITEM",
          prizeItemId,
          quantity: 2,
          weight: 4000,
          displayOrder: 1,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanFixtures();
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("spends exactly one card and pays exactly one prize", async () => {
    await give(3);
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    const { outcome, replayed } = await scratch();
    expect(replayed).toBe(false);
    expect([coinPrizeId, itemPrizeId]).toContain(outcome.prizeId);

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: cardId } },
    });
    expect(entry.quantity).toBe(2);

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (outcome.kind === "COINS") {
      expect(after.coins).toBe(before.coins + 25n);
      expect(outcome.coins).toBe("25");
    } else {
      expect(after.coins).toBe(before.coins);
      const won = await db.inventoryEntry.findUniqueOrThrow({
        where: { userId_itemId: { userId, itemId: prizeItemId } },
      });
      expect(won.quantity).toBe(2);
    }
    // Exactly one consumption row and one prize row.
    expect(
      await db.transaction.count({ where: { userId, type: "ITEM_USE" } }),
    ).toBe(1);
    expect(
      await db.transaction.count({ where: { userId, type: "SCRATCH_PRIZE" } }),
    ).toBe(1);
  });

  // Sequential by design — the point is the draw, not throughput — so it
  // gets a timeout that matches a few hundred real round trips.
  it("follows the published weights over many scratches", { timeout: 30_000 }, async () => {
    // The odds shown and the odds drawn must be the same thing. This is the
    // assertion that would catch a table read in the wrong order, a
    // filtered-out outcome, or an off-by-one in the weighted pick.
    const runs = 300;
    await give(runs);
    let coinCount = 0;
    // Spread across simulated minutes rather than turning the limiter off:
    // 30 scratches a minute is a real rule and a test that needs it
    // disabled is a test that has stopped resembling play.
    const base = new Date("2031-02-02T00:00:00Z").getTime();
    for (let i = 0; i < runs; i++) {
      const { outcome } = await scratch({
        now: new Date(base + i * 3_000),
      });
      if (outcome.prizeId === coinPrizeId) coinCount += 1;
    }
    const share = coinCount / runs;
    // 60% expected. At n=300 one standard deviation is ~2.8 points, so
    // ±9 is a shade over three of them: wide enough that the suite does
    // not flake, tight enough that a real bias cannot hide in it.
    expect(share).toBeGreaterThan(0.51);
    expect(share).toBeLessThan(0.69);

    const results = await db.scratchResult.count({ where: { userId } });
    expect(results).toBe(runs);
  });

  it("never pays twice for one card on a replay", async () => {
    await give(2);
    const key = randomUUID();
    const first = await scratch({ key });
    const replay = await scratch({ key });

    expect(replay.replayed).toBe(true);
    expect(replay.outcome.prizeId).toBe(first.outcome.prizeId);
    expect(replay.outcome.coins).toBe(first.outcome.coins);

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: cardId } },
    });
    expect(entry.quantity).toBe(1);
    expect(await db.scratchResult.count({ where: { userId } })).toBe(1);
  });

  it("cannot be raced into scratching more cards than are held", async () => {
    await give(2);
    const race = await runConcurrently([
      () => scratch(),
      () => scratch(),
      () => scratch(),
      () => scratch(),
    ]);
    expect(race.fulfilled.length + race.rejected.length).toBe(4);

    const entry = await db.inventoryEntry.findUnique({
      where: { userId_itemId: { userId, itemId: cardId } },
    });
    expect(entry?.quantity ?? 0).toBe(0);
    // Two cards in, at most two outcomes out — and never more results than
    // cards consumed.
    const results = await db.scratchResult.count({ where: { userId } });
    expect(results).toBeLessThanOrEqual(2);
    expect(
      await db.transaction.count({ where: { userId, type: "SCRATCH_PRIZE" } }),
    ).toBe(results);
  });

  it("refuses when the satchel is empty, and takes nothing", async () => {
    await give(0);
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await expectScratchError(scratch(), "NONE_IN_SATCHEL");
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins);
    expect(await db.scratchResult.count({ where: { userId } })).toBe(0);
  });

  it("refuses an item that is not a card", async () => {
    const plain = await createTestItem(db, { slug: `${prefix}-plain` });
    await expectScratchError(scratch({ itemId: plain.id }), "NOT_A_CARD");
  });

  it("refuses a withdrawn card without consuming it", async () => {
    await give(1);
    await db.item.update({
      where: { id: cardId },
      data: { lifecycle: "DISABLED" },
    });
    try {
      await expectScratchError(scratch(), "CARD_WITHDRAWN");
      const entry = await db.inventoryEntry.findUniqueOrThrow({
        where: { userId_itemId: { userId, itemId: cardId } },
      });
      expect(entry.quantity).toBe(1);
    } finally {
      await db.item.update({
        where: { id: cardId },
        data: { lifecycle: "ACTIVE" },
      });
    }
  });

  it("refuses to draw from a table that does not add up", async () => {
    // Mid-edit is the dangerous moment: paying out against percentages the
    // player was never shown is exactly the dishonesty this feature must
    // not have. Nothing is consumed.
    await give(1);
    await db.scratchPrize.update({
      where: { id: itemPrizeId },
      data: { weight: 1 },
    });
    await expectScratchError(scratch(), "TABLE_UNAVAILABLE");
    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: cardId } },
    });
    expect(entry.quantity).toBe(1);
  });

  it("pays a withdrawn prize item out in coins rather than nothing", async () => {
    // The player bought a card that listed that outcome. An operator
    // retiring the item afterwards is not theirs to absorb.
    await give(1);
    await db.scratchPrize.update({
      where: { id: coinPrizeId },
      data: { active: false },
    });
    await db.scratchPrize.update({
      where: { id: itemPrizeId },
      data: { weight: SCRATCH_TOTAL_WEIGHT },
    });
    await db.item.update({
      where: { id: prizeItemId },
      data: { lifecycle: "DISABLED" },
    });
    try {
      const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
      const { outcome } = await scratch();
      expect(outcome.kind).toBe("COINS");
      // The item's reference price, not zero.
      expect(outcome.coins).toBe("40");
      const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
      expect(after.coins).toBe(before.coins + 40n);
      expect(
        await db.inventoryEntry.findUnique({
          where: { userId_itemId: { userId, itemId: prizeItemId } },
        }),
      ).toBeNull();
    } finally {
      await db.item.update({
        where: { id: prizeItemId },
        data: { lifecycle: "ACTIVE" },
      });
    }
  });

  it("publishes odds that match the rows the draw uses", async () => {
    const odds = await getScratchOdds(db, { itemId: cardId });
    expect(odds).not.toBeNull();
    expect(odds!.rows).toHaveLength(2);
    expect(odds!.rows.map((row) => row.chance)).toEqual([60, 40]);
    // Expected return: 0.6 × 25 + 0.4 × (40 × 2) = 15 + 32 = 47.
    expect(odds!.expectedReturnJson).toBe("47");
    // And it is below the price, which is the whole economic guardrail.
    expect(BigInt(odds!.expectedReturnJson)).toBeLessThan(BigInt(odds!.priceJson));
    expect(await getScratchOdds(db, { itemId: prizeItemId })).toBeNull();
  });

  it("records history a player can read back", async () => {
    await give(2);
    await scratch();
    await scratch();
    const history = await getScratchHistory(db, { userId });
    expect(history).toHaveLength(2);
    for (const row of history) {
      expect(row.cardName).toBeTruthy();
      expect(["Some coins", "A trinket"]).toContain(row.label);
    }
  });
});
