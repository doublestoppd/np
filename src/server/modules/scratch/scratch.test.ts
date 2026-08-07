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
import { getScratchCardView, getScratchHistory } from "./queries";
import { getJackpot } from "./jackpot";
import { JACKPOT_MINIMUM, JACKPOT_SLUG } from "./config";
import { isNearMiss, isWinningReveal, parseReveal } from "@/lib/games/scratch-symbols";
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
  let nothingPrizeId: string;
  let jackpotPrizeId: string;

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

    await db.scratchCard.create({
      data: { itemId: cardId, tier: 1, jackpotBps: 500 },
    });
    // A deliberately lopsided table. The blank is the commonest outcome,
    // as it is on the shipped cards, so the loss path is what most of
    // these assertions actually exercise.
    nothingPrizeId = (
      await db.scratchPrize.create({
        data: {
          cardItemId: cardId,
          label: "Salt, and more salt",
          kind: "NOTHING",
          weight: 3000,
          displayOrder: 2,
        },
      })
    ).id;
    jackpotPrizeId = (
      await db.scratchPrize.create({
        data: {
          cardItemId: cardId,
          label: "THE PANS",
          kind: "JACKPOT",
          weight: 1000,
          displayOrder: 3,
        },
      })
    ).id;
    coinPrizeId = (
      await db.scratchPrize.create({
        data: {
          cardItemId: cardId,
          label: "Some coins",
          kind: "COINS",
          coinAmount: 25n,
          weight: 3000,
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
          weight: 3000,
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

  it("spends one card and settles one outcome, win or lose", async () => {
    await give(3);
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    const { outcome, replayed } = await scratch();
    expect(replayed).toBe(false);
    expect([coinPrizeId, itemPrizeId, nothingPrizeId, jackpotPrizeId]).toContain(
      outcome.prizeId,
    );

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: cardId } },
    });
    expect(entry.quantity).toBe(2);
    // The card is spent either way — that is the whole bargain.
    expect(
      await db.transaction.count({ where: { userId, type: "ITEM_USE" } }),
    ).toBe(1);

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (outcome.kind === "NOTHING") {
      expect(outcome.won).toBe(false);
      expect(after.coins).toBe(before.coins);
      // A loss moves nothing, so it writes no prize row at all.
      expect(
        await db.transaction.count({ where: { userId, type: "SCRATCH_PRIZE" } }),
      ).toBe(0);
    } else {
      expect(outcome.won).toBe(true);
      expect(
        await db.transaction.count({ where: { userId, type: "SCRATCH_PRIZE" } }),
      ).toBe(1);
    }
  });

  it("shows three matching marks exactly when the card won", async () => {
    // The reveal is dressed onto a decided outcome, so it can only ever
    // agree with the payout. A card that showed three of a kind and paid
    // nothing would be the one defect here a player could catch.
    await give(60);
    const base = new Date("2031-03-03T00:00:00Z").getTime();
    let losses = 0;
    let nearMisses = 0;
    for (let i = 0; i < 60; i++) {
      const { outcome } = await scratch({ now: new Date(base + i * 3_000) });
      const marks = parseReveal(outcome.reveal);
      expect(marks).toHaveLength(3);
      expect(isWinningReveal(marks)).toBe(outcome.won);
      if (!outcome.won) {
        losses += 1;
        if (isNearMiss(marks)) nearMisses += 1;
      }
    }
    expect(losses).toBeGreaterThan(0);
    // Near misses are deliberately common — they are most of what a
    // losing card feels like.
    expect(nearMisses).toBeGreaterThan(0);
  });

  it("keeps the same marks on a replay", async () => {
    await give(2);
    const key = randomUUID();
    const first = await scratch({ key });
    const replay = await scratch({ key });
    // A card that changed its face on a refresh is the one thing here a
    // player could reasonably call rigged.
    expect(replay.outcome.reveal).toBe(first.outcome.reveal);
    expect(replay.outcome.won).toBe(first.outcome.won);
  });

  it("feeds the pool on every scratch and pays it out in full", async () => {
    await db.scratchJackpot.updateMany({
      where: { slug: JACKPOT_SLUG },
      data: { pool: 0n },
    });
    // Only the blank can be drawn, so the pool grows without being won.
    await db.scratchPrize.updateMany({
      where: { cardItemId: cardId, id: { not: nothingPrizeId } },
      data: { active: false },
    });
    await db.scratchPrize.update({
      where: { id: nothingPrizeId },
      data: { weight: 10_000 },
    });
    await give(4);
    const base = new Date("2031-03-04T00:00:00Z").getTime();
    for (let i = 0; i < 4; i++) {
      await scratch({ now: new Date(base + i * 3_000) });
    }
    // 5% of a 100-coin card, four times.
    const pooled = await db.scratchJackpot.findUniqueOrThrow({
      where: { slug: JACKPOT_SLUG },
    });
    expect(pooled.pool).toBe(20n);

    // Now force the jackpot and take it.
    await db.scratchPrize.update({
      where: { id: nothingPrizeId },
      data: { active: false },
    });
    await db.scratchPrize.update({
      where: { id: jackpotPrizeId },
      data: { active: true, weight: 10_000 },
    });
    await db.scratchJackpot.updateMany({
      where: { slug: JACKPOT_SLUG },
      data: { pool: 9_000n },
    });
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await give(1);
    const { outcome } = await scratch({ now: new Date(base + 60_000) });
    expect(outcome.kind).toBe("JACKPOT");
    // The pool it stood at, plus this scratch's own slice.
    expect(outcome.coins).toBe("9005");
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins + 9_005n);
    const drained = await db.scratchJackpot.findUniqueOrThrow({
      where: { slug: JACKPOT_SLUG },
    });
    expect(drained.pool).toBe(0n);
    expect(drained.lastWonBy).toBe(userId);
  });

  it("never pays a jackpot below the floor", async () => {
    await db.scratchPrize.updateMany({
      where: { cardItemId: cardId },
      data: { active: false },
    });
    await db.scratchPrize.update({
      where: { id: jackpotPrizeId },
      data: { active: true, weight: 10_000 },
    });
    await db.scratchJackpot.updateMany({
      where: { slug: JACKPOT_SLUG },
      data: { pool: 0n },
    });
    await give(1);
    const { outcome } = await scratch();
    // An empty pool still pays: a jackpot that can hand over nothing is
    // not a jackpot.
    expect(BigInt(outcome.coins)).toBeGreaterThanOrEqual(JACKPOT_MINIMUM);
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
    // One ledger row per winner and none for a loser, whichever way the
    // draws fell. Counting rows against *results* instead would fail
    // whenever a card lost, which is most of the time.
    const winners = await db.scratchResult.count({
      where: { userId, won: true },
    });
    expect(
      await db.transaction.count({ where: { userId, type: "SCRATCH_PRIZE" } }),
    ).toBe(winners);
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
    await db.scratchPrize.updateMany({
      where: { cardItemId: cardId, id: { not: itemPrizeId } },
      data: { active: false },
    });
    await db.scratchPrize.update({
      where: { id: itemPrizeId },
      data: { active: true, weight: SCRATCH_TOTAL_WEIGHT },
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

  it("publishes the ladder and the pool, but never the odds", async () => {
    const view = await getScratchCardView(db, { itemId: cardId });
    expect(view).not.toBeNull();
    // Winning outcomes only, richest first — the blank is not advertised
    // as a prize, and no weight or percentage appears anywhere.
    expect(view!.prizes.map((row) => row.label)).not.toContain(
      "Salt, and more salt",
    );
    expect(view!.topPrize?.kind).toBe("JACKPOT");
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("weight");
    expect(serialized).not.toContain("chance");

    // The pool is public, because chasing it is the point.
    expect(BigInt(view!.jackpot.standsAt)).toBeGreaterThanOrEqual(
      JACKPOT_MINIMUM,
    );
    const jackpot = await getJackpot(db);
    expect(jackpot.standsAt).toBe(view!.jackpot.standsAt);

    expect(await getScratchCardView(db, { itemId: prizeItemId })).toBeNull();
  });

  it("records history a player can read back", async () => {
    await give(2);
    await scratch();
    await scratch();
    const history = await getScratchHistory(db, { userId });
    expect(history).toHaveLength(2);
    for (const row of history) {
      expect(row.cardName).toBeTruthy();
      expect([
        "Some coins",
        "A trinket",
        "Salt, and more salt",
        "THE PANS",
      ]).toContain(row.label);
      // A losing card is history too — it is most of the history.
      expect(typeof row.won).toBe("boolean");
      expect(row.reveal).toHaveLength(3);
    }
  });
});
