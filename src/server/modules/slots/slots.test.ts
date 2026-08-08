/**
 * The Tumblehouse drums: the draw, the ledger, and the guardrails that
 * keep a game of chance from becoming a faucet (ADR-49).
 *
 * Runs against a real PostgreSQL database with its own fixture token, so
 * the distribution assertions are not at the mercy of authored content.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { spinDrums } from "./spin";
import { getSlotHistory, getSlotMachineView, getSlotTokenView } from "./queries";
import { SlotError } from "./errors";
import { drawReels } from "./reels";
import { isNearMissReels, isWinningReels, parseReels } from "@/lib/games/slot-faces";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";

const prefix = fixturePrefix("slots");

async function expectSlotError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(SlotError);
  expect((error as SlotError).slotCode).toBe(code);
}

describe.skipIf(!testDb)("the drums (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let tokenId: string;
  let prizeItemId: string;
  let coinPrizeId: string;
  let itemPrizeId: string;
  let nothingPrizeId: string;

  const FACES = 4;

  const spin = (
    overrides: { key?: string; itemId?: string; now?: Date } = {},
  ) =>
    spinDrums(db, {
      userId,
      itemId: overrides.itemId ?? tokenId,
      idempotencyKey: overrides.key ?? randomUUID(),
      ...(overrides.now ? { now: overrides.now } : {}),
    });

  /** Puts `n` tokens in the satchel. */
  async function give(n: number, itemId = tokenId): Promise<void> {
    await db.inventoryEntry.upsert({
      where: { userId_itemId: { userId, itemId } },
      create: { userId, itemId, quantity: n },
      update: { quantity: n },
    });
  }

  async function cleanFixtures(): Promise<void> {
    await db.slotSpin.deleteMany({
      where: { prize: { token: { item: { slug: { startsWith: prefix } } } } },
    });
    await db.slotPrize.deleteMany({
      where: { token: { item: { slug: { startsWith: prefix } } } },
    });
    await db.spinToken.deleteMany({
      where: { item: { slug: { startsWith: prefix } } },
    });
  }

  beforeEach(async () => {
    await cleanFixtures();
    userId = (
      await createTestUser(db, { username: `${prefix}_${randomUUID().slice(0, 8)}` })
    ).id;

    tokenId =
      tokenId ??
      (
        await createTestItem(db, {
          slug: `${prefix}-token`,
          type: "SPIN_TOKEN",
          price: 100n,
        })
      ).id;
    prizeItemId =
      prizeItemId ??
      (await createTestItem(db, { slug: `${prefix}-prize`, price: 40n })).id;

    await db.spinToken.create({
      data: { itemId: tokenId, tier: 1, faces: FACES },
    });
    // A deliberately lopsided table. The blank is the commonest outcome,
    // as it is on the shipped tiers, so the loss path is what most of
    // these assertions actually exercise.
    nothingPrizeId = (
      await db.slotPrize.create({
        data: {
          tokenItemId: tokenId,
          label: "The drums disagree",
          kind: "NOTHING",
          weight: 4000,
          displayOrder: 2,
        },
      })
    ).id;
    coinPrizeId = (
      await db.slotPrize.create({
        data: {
          tokenItemId: tokenId,
          label: "Some coins",
          kind: "COINS",
          coinAmount: 25n,
          faceIndex: 0,
          weight: 3000,
          displayOrder: 0,
        },
      })
    ).id;
    itemPrizeId = (
      await db.slotPrize.create({
        data: {
          tokenItemId: tokenId,
          label: "A trinket",
          kind: "ITEM",
          prizeItemId,
          quantity: 2,
          faceIndex: 1,
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

  it("spends one token and settles one outcome, win or lose", async () => {
    await give(3);
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    const { outcome, replayed } = await spin();
    expect(replayed).toBe(false);
    expect([coinPrizeId, itemPrizeId, nothingPrizeId]).toContain(outcome.prizeId);

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: tokenId } },
    });
    expect(entry.quantity).toBe(2);
    // The token is spent either way — that is the whole bargain.
    expect(
      await db.transaction.count({ where: { userId, type: "ITEM_USE" } }),
    ).toBe(1);

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (outcome.kind === "NOTHING") {
      expect(outcome.won).toBe(false);
      expect(after.coins).toBe(before.coins);
      expect(outcome.transactionId).toBeNull();
    } else if (outcome.kind === "COINS") {
      expect(after.coins).toBe(before.coins + 25n);
    } else {
      const prize = await db.inventoryEntry.findUniqueOrThrow({
        where: { userId_itemId: { userId, itemId: prizeItemId } },
      });
      expect(prize.quantity).toBe(2);
    }
  });

  /**
   * The load-bearing invariant of the whole feature: the drums say exactly
   * what happened. Three matching faces if and only if the pull paid.
   *
   * If the reels were drawn first and the prize read off them, this would
   * still pass while the authored weights quietly became fiction — which
   * is why the ordering is stated in reels.ts and asserted here.
   */
  it("shows three matching faces exactly when the pull paid", async () => {
    await give(60);
    // The clock is walked forward so the loop steps past the per-minute
    // rate limit rather than tripping it — the limit is real and bounds
    // automation, and a test is not a reason to weaken it.
    const base = new Date("2031-03-03T00:00:00Z").getTime();
    for (let i = 0; i < 60; i++) {
      const { outcome } = await spin({ now: new Date(base + i * 3_000) });
      const reels = parseReels(outcome.reels);
      expect(reels).toHaveLength(3);
      expect(isWinningReels(reels)).toBe(outcome.won);
      // And the face shown is the one the ladder promised for that prize.
      if (outcome.won) {
        const prize = await db.slotPrize.findUniqueOrThrow({
          where: { id: outcome.prizeId },
        });
        expect(reels[0]).toBe(prize.faceIndex);
      }
      // Nothing ever lands on a face the drum does not carry.
      for (const face of reels) {
        expect(face).toBeLessThan(FACES);
      }
    }
  });

  it("keeps the same drums on a replay", async () => {
    await give(2);
    const key = randomUUID();
    const first = await spin({ key });
    const replay = await spin({ key });

    expect(replay.replayed).toBe(true);
    expect(replay.outcome.reels).toBe(first.outcome.reels);
    expect(replay.outcome.prizeId).toBe(first.outcome.prizeId);

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: tokenId } },
    });
    expect(entry.quantity).toBe(1);
    expect(await db.slotSpin.count({ where: { userId } })).toBe(1);
  });

  it("cannot be raced into spending more tokens than are held", async () => {
    await give(2);
    const race = await runConcurrently([
      () => spin(),
      () => spin(),
      () => spin(),
      () => spin(),
    ]);
    expect(race.fulfilled.length + race.rejected.length).toBe(4);

    const entry = await db.inventoryEntry.findUnique({
      where: { userId_itemId: { userId, itemId: tokenId } },
    });
    expect(entry?.quantity ?? 0).toBe(0);
    const spins = await db.slotSpin.count({ where: { userId } });
    expect(spins).toBeLessThanOrEqual(2);
    // One ledger row per winner and none for a loser, whichever way the
    // draws fell.
    const winners = await db.slotSpin.count({ where: { userId, won: true } });
    expect(
      await db.transaction.count({ where: { userId, type: "SLOT_PRIZE" } }),
    ).toBe(winners);
  });

  it("refuses when the satchel is empty, and takes nothing", async () => {
    await give(0);
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await expectSlotError(spin(), "NONE_IN_SATCHEL");
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins);
    expect(await db.slotSpin.count({ where: { userId } })).toBe(0);
  });

  it("refuses an item that is not a token", async () => {
    const notAToken = await createTestItem(db, {
      slug: `${prefix}-not-a-token-${randomUUID().slice(0, 8)}`,
    });
    await give(1, notAToken.id);
    await expectSlotError(spin({ itemId: notAToken.id }), "NOT_A_TOKEN");
  });

  it("refuses a token the house has stopped honouring, spending nothing", async () => {
    const dead = await createTestItem(db, {
      slug: `${prefix}-dead-${randomUUID().slice(0, 8)}`,
      type: "SPIN_TOKEN",
      lifecycle: "DISABLED",
    });
    await db.spinToken.create({ data: { itemId: dead.id, tier: 1, faces: 3 } });
    await db.slotPrize.create({
      data: {
        tokenItemId: dead.id,
        label: "Nothing",
        kind: "NOTHING",
        weight: 10_000,
        displayOrder: 0,
      },
    });
    await give(1, dead.id);
    await expectSlotError(spin({ itemId: dead.id }), "TOKEN_WITHDRAWN");
    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: dead.id } },
    });
    expect(entry.quantity).toBe(1);
  });

  it("refuses a table whose weights do not add up, spending nothing", async () => {
    await db.slotPrize.update({
      where: { id: nothingPrizeId },
      data: { weight: 1 },
    });
    await give(1);
    await expectSlotError(spin(), "TABLE_UNAVAILABLE");
    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: tokenId } },
    });
    expect(entry.quantity).toBe(1);
  });

  it("pays a withdrawn prize item in coins rather than nothing", async () => {
    // Only the item outcome can win, so the draw is forced.
    await db.slotPrize.update({
      where: { id: coinPrizeId },
      data: { weight: 1, active: false },
    });
    await db.slotPrize.update({
      where: { id: nothingPrizeId },
      data: { weight: 1, active: false },
    });
    await db.slotPrize.update({
      where: { id: itemPrizeId },
      data: { weight: 10_000 },
    });
    await db.item.update({
      where: { id: prizeItemId },
      data: { lifecycle: "DISABLED" },
    });
    await give(1);
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    const { outcome } = await spin();
    expect(outcome.kind).toBe("COINS");
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    // Reference value 40, times the quantity of 2. The multiplier is the
    // point: the published ladder advertises the outcome as 2 x 40, so
    // paying a single unit's worth would quietly shortchange the player
    // against the number they were shown.
    expect(after.coins).toBe(before.coins + 80n);

    await db.item.update({
      where: { id: prizeItemId },
      data: { lifecycle: "ACTIVE" },
    });
  });

  it("publishes the ladder, but never the odds", async () => {
    const view = await getSlotTokenView(db, { itemId: tokenId });
    expect(view).not.toBeNull();
    // Winners only, richest first. The blank is deliberately absent.
    expect(view?.prizes.map((prize) => prize.label)).toEqual([
      "A trinket",
      "Some coins",
    ]);
    expect(view?.topPrize?.label).toBe("A trinket");
    // Structural, not cosmetic: there is nowhere in the view model to put
    // a weight, so a template cannot leak one by accident.
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("weight");
    expect(serialized).not.toContain("chance");
    expect(serialized).not.toContain("4000");
  });

  it("lists every tier on the machine, with what the viewer holds", async () => {
    await give(3);
    const machine = await getSlotMachineView(db, { userId });
    const fixture = machine.tokens.find((token) => token.itemId === tokenId);
    expect(fixture?.owned).toBe(3);
    // The shipped tiers are all there too, held or not — the point of a
    // five-tier machine is seeing what you cannot afford yet.
    expect(machine.tokens.length).toBeGreaterThanOrEqual(5);
    expect(machine.tokens.map((token) => token.tier)).toEqual(
      [...machine.tokens.map((token) => token.tier)].sort((a, b) => a - b),
    );
  });

  it("records losses in history as well as wins", async () => {
    await give(8);
    const base = new Date("2031-04-04T00:00:00Z").getTime();
    for (let i = 0; i < 8; i++) await spin({ now: new Date(base + i * 3_000) });
    const history = await getSlotHistory(db, { userId });
    expect(history).toHaveLength(8);
    for (const row of history) {
      expect(row.reels).toMatch(/^[0-9a-f]{3}$/);
      expect(isWinningReels(parseReels(row.reels))).toBe(row.won);
    }
  });

  describe("dressing the drums", () => {
    it("never shows three alike on a loss, at any drum size", () => {
      for (const faces of [3, 6, 10, 12]) {
        for (let i = 0; i < 200; i++) {
          const reels = parseReels(
            drawReels({ won: false, faces, winningFace: null }),
          );
          expect(isWinningReels(reels)).toBe(false);
          expect(Math.max(...reels)).toBeLessThan(faces);
        }
      }
    });

    it("produces near misses often, because that is the point", () => {
      let nearMisses = 0;
      const runs = 400;
      for (let i = 0; i < runs; i++) {
        if (
          isNearMissReels(
            parseReels(drawReels({ won: false, faces: 6, winningFace: null })),
          )
        ) {
          nearMisses++;
        }
      }
      // NEAR_MISS_CHANCE is 60. Wide bounds — this asserts the intent
      // (most losses tease) without pinning the constant.
      expect(nearMisses).toBeGreaterThan(runs * 0.4);
      expect(nearMisses).toBeLessThan(runs * 0.8);
    });

    it("shows the winner's own face three times", () => {
      for (let face = 0; face < 6; face++) {
        const reels = parseReels(
          drawReels({ won: true, faces: 6, winningFace: face }),
        );
        expect(reels).toEqual([face, face, face]);
      }
    });
  });
});
