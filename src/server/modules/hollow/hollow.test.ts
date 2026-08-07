/**
 * The Hollow: the deep coin sink and the game's only composition surface.
 *
 * Two families of test here. The first is the ordinary economy discipline
 * every coin path gets — you cannot spend what you do not have, a replayed
 * purchase does not buy twice, concurrent buys do not both succeed. The
 * second is unusual and deliberate: tests that assert things are *absent*.
 * A Hollow has no totals, no percentages, and no rarity, and the gravity
 * of the genre pulls hard toward adding them, so the shapes are pinned.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  clearAnchor,
  ensureHollow,
  moveFurnishing,
  moveScene,
  placeFurnishing,
  purchaseAir,
  purchaseFurnishing,
  purchaseGround,
  setSceneAir,
  setSceneCaption,
} from "./commands";
import {
  getHollow,
  getPublicHollow,
  listCatalogue,
  listPlaceable,
} from "./queries";
import { growthStage, GROWTH_STAGES } from "./config";
import { HollowError } from "./errors";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";

const prefix = fixturePrefix("hollow");

async function expectHollowError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HollowError);
  expect((error as HollowError).hollowCode).toBe(code);
}

describe.skipIf(!testDb)("the Hollow (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let username: string;
  let smallSlug: string;
  let largeSlug: string;
  let saplingSlug: string;
  let groundKeys: string[] = [];
  let paidAirKey: string;

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    username = `${prefix}_${suffix}`;
    userId = (await createTestUser(db, { username, coins: 500_000n })).id;
  });

  beforeEach(async () => {
    if (smallSlug) return;
    smallSlug = `${prefix}-stone`;
    largeSlug = `${prefix}-arch`;
    saplingSlug = `${prefix}-sapling`;
    for (const [slug, size, price, growthDays] of [
      [smallSlug, "SMALL", 100n, null],
      [largeSlug, "LARGE", 9_000n, null],
      [saplingSlug, "MEDIUM", 4_000n, 60],
    ] as const) {
      const item = await createTestItem(db, {
        slug,
        price,
        tradeable: false,
      });
      await db.furnishing.create({
        data: { itemId: item.id, size, growthDays },
      });
    }
    const grounds = await db.hollowGroundDefinition.findMany({
      orderBy: { sortOrder: "asc" },
      select: { key: true },
    });
    groundKeys = grounds.map((ground) => ground.key);
    const paid = await db.hollowAirDefinition.findFirstOrThrow({
      where: { price: { gt: 0n } },
      orderBy: { price: "asc" },
    });
    paidAirKey = paid.key;
  });

  afterAll(async () => {
    await db.hollowPlacement.deleteMany({
      where: { scene: { hollow: { user: { username: { startsWith: prefix } } } } },
    });
    await db.transaction.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await db.furnishing.deleteMany({
      where: { item: { slug: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  async function open() {
    await ensureHollow(db, userId);
    const view = await getHollow(db, { userId });
    if (!view) throw new Error("no hollow");
    return view;
  }

  async function buy(slug: string, quantity = 1) {
    await purchaseFurnishing(db, {
      userId,
      slug,
      quantity,
      idempotencyKey: randomUUID(),
    });
  }

  it("opens with one ground, one free air, and things already standing in it", async () => {
    const view = await open();
    expect(view.sceneCount).toBe(1);
    const scene = view.scenes[0];
    expect(scene?.anchors).toHaveLength(8);
    // Not bare on day one: an empty eight-anchor picture reads as a chore
    // list, and a few worn objects read as somewhere already lived in.
    const standing = scene?.anchors.filter((a) => a.standing !== null) ?? [];
    expect(standing.length).toBeGreaterThan(0);
    expect(view.airs.filter((air) => air.held)).toHaveLength(1);
    expect(view.airs.find((air) => air.held)?.price).toBe("0");
  });

  it("is opened once, even from several requests at the same time", async () => {
    const outcome = await runConcurrently(
      Array.from({ length: 4 }, () => () => ensureHollow(db, userId)),
    );
    expect(outcome.rejected).toHaveLength(0);
    expect(new Set(outcome.fulfilled).size).toBe(1);
    expect(await db.hollow.count({ where: { userId } })).toBe(1);
  });

  it("buys a furnishing, debits the wallet, and writes a ledger row", async () => {
    await open();
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await buy(smallSlug, 3);
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(before.coins - after.coins).toBe(300n);

    const item = await db.item.findUniqueOrThrow({ where: { slug: smallSlug } });
    const owned = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: item.id } },
    });
    expect(owned.quantity).toBe(3);
    const ledger = await db.transaction.findFirstOrThrow({
      where: { userId, type: "FURNISHING_PURCHASE" },
    });
    expect(ledger.coinsDelta).toBe(-300n);
    expect(ledger.quantity).toBe(3);
  });

  it("does not buy twice for one idempotency key", async () => {
    await open();
    const key = randomUUID();
    const first = await purchaseFurnishing(db, {
      userId,
      slug: smallSlug,
      quantity: 1,
      idempotencyKey: key,
    });
    const second = await purchaseFurnishing(db, {
      userId,
      slug: smallSlug,
      quantity: 1,
      idempotencyKey: key,
    });
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    const item = await db.item.findUniqueOrThrow({ where: { slug: smallSlug } });
    const owned = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: item.id } },
    });
    expect(owned.quantity).toBe(1);
  });

  it("refuses to sell what the player cannot afford", async () => {
    await open();
    await db.user.update({ where: { id: userId }, data: { coins: 10n } });
    await expect(buy(largeSlug)).rejects.toThrow();
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(10n);
  });

  it("prices the next ground by how many you hold, not by which you pick", async () => {
    const view = await open();
    const [, second, third] = groundKeys;
    const firstPrice = view.nextGroundPrice;

    await purchaseGround(db, {
      userId,
      groundKey: second as string,
      idempotencyKey: randomUUID(),
    });
    const afterOne = await getHollow(db, { userId });
    expect(afterOne?.sceneCount).toBe(2);
    // The rung moved on, so the third ground costs more than the second
    // did — regardless of which picture was chosen.
    expect(afterOne?.nextGroundPrice).not.toBe(firstPrice);

    await expectHollowError(
      purchaseGround(db, {
        userId,
        groundKey: second as string,
        idempotencyKey: randomUUID(),
      }),
      "GROUND_ALREADY_HELD",
    );
    expect(third).toBeDefined();
  });

  it("sells one ground when two requests arrive together", async () => {
    await open();
    const key = groundKeys[1] as string;
    const outcome = await runConcurrently(
      Array.from(
        { length: 3 },
        () => () =>
          purchaseGround(db, {
            userId,
            groundKey: key,
            idempotencyKey: randomUUID(),
          }),
      ),
    );
    expect(outcome.fulfilled).toHaveLength(1);
    const view = await getHollow(db, { userId });
    expect(view?.sceneCount).toBe(2);
  });

  it("gives an air to the account, not to one ground", async () => {
    const view = await open();
    await purchaseGround(db, {
      userId,
      groundKey: groundKeys[1] as string,
      idempotencyKey: randomUUID(),
    });
    await purchaseAir(db, {
      userId,
      airKey: paidAirKey,
      idempotencyKey: randomUUID(),
    });

    const after = await getHollow(db, { userId });
    // One purchase, and it is available on every ground the player has —
    // which is what makes it re-value everything already owned.
    for (const scene of after?.scenes ?? []) {
      await setSceneAir(db, { userId, sceneId: scene.id, airKey: paidAirKey });
    }
    const applied = await getHollow(db, { userId });
    expect(applied?.scenes.every((scene) => scene.airKey === paidAirKey)).toBe(
      true,
    );
    expect(view.airs.find((air) => air.key === paidAirKey)?.held).toBe(false);
  });

  it("refuses an air the player has not bought", async () => {
    const view = await open();
    const sceneId = view.scenes[0]?.id as string;
    await expectHollowError(
      setSceneAir(db, { userId, sceneId, airKey: paidAirKey }),
      "AIR_NOT_HELD",
    );
  });

  it("stands a furnishing only where it fits, and only if you own a spare", async () => {
    const view = await open();
    const scene = view.scenes[0];
    const sceneId = scene?.id as string;
    const small = scene?.anchors.find(
      (a) => a.maxSize === "SMALL" && a.standing === null,
    );
    const centre = scene?.anchors.find((a) => a.maxSize === "CENTREPIECE");
    // A new Hollow must leave somewhere to put a small thing without
    // first clearing one of the pieces it arrived with.
    expect(small).toBeDefined();
    expect(centre).toBeDefined();

    await expectHollowError(
      placeFurnishing(db, {
        userId,
        sceneId,
        anchorKey: small?.key as string,
        slug: smallSlug,
      }),
      "NOT_OWNED",
    );

    await buy(smallSlug, 1);
    await placeFurnishing(db, {
      userId,
      sceneId,
      anchorKey: small?.key as string,
      slug: smallSlug,
    });

    // One copy, one place. The second attempt is refused by the live
    // placement count, not by anything the client said.
    const elsewhere = scene?.anchors.find(
      (a) => a.key !== small?.key && a.standing === null,
    );
    expect(elsewhere).toBeDefined();
    await expectHollowError(
      placeFurnishing(db, {
        userId,
        sceneId,
        anchorKey: elsewhere?.key as string,
        slug: smallSlug,
      }),
      "ALL_COPIES_PLACED",
    );

    await buy(largeSlug, 1);
    await expectHollowError(
      placeFurnishing(db, {
        userId,
        sceneId,
        anchorKey: small?.key as string,
        slug: largeSlug,
      }),
      "ANCHOR_TAKEN",
    );
    // A large thing does fit the centre, which takes anything.
    await placeFurnishing(db, {
      userId,
      sceneId,
      anchorKey: centre?.key as string,
      slug: largeSlug,
    });
  });

  it("refuses a big thing in a small place", async () => {
    const view = await open();
    const scene = view.scenes[0];
    const small = scene?.anchors.find(
      (a) => a.maxSize === "SMALL" && a.standing === null,
    );
    expect(small).toBeDefined();
    await buy(largeSlug, 1);
    await expectHollowError(
      placeFurnishing(db, {
        userId,
        sceneId: scene?.id as string,
        anchorKey: small?.key as string,
        slug: largeSlug,
      }),
      "DOES_NOT_FIT",
    );
  });

  it("keeps a growing thing's clock when it is moved, and loses it when it is put away", async () => {
    const view = await open();
    const scene = view.scenes[0];
    const sceneId = scene?.id as string;
    const anchors = scene?.anchors.filter(
      (a) => a.standing === null && a.maxSize !== "SMALL",
    );
    const from = anchors?.[0]?.key as string;
    const to = anchors?.[1]?.key as string;

    await buy(saplingSlug, 1);
    const planted = new Date(Date.now() - 30 * 86_400_000);
    await placeFurnishing(db, {
      userId,
      sceneId,
      anchorKey: from,
      slug: saplingSlug,
      now: planted,
    });

    await moveFurnishing(db, {
      userId,
      fromSceneId: sceneId,
      fromAnchorKey: from,
      toSceneId: sceneId,
      toAnchorKey: to,
    });
    const moved = await db.hollowPlacement.findUniqueOrThrow({
      where: { sceneId_anchorKey: { sceneId, anchorKey: to } },
    });
    // Rearranging must never cost a player two months.
    expect(moved.plantedAt.getTime()).toBe(planted.getTime());

    await clearAnchor(db, { userId, sceneId, anchorKey: to });
    await placeFurnishing(db, { userId, sceneId, anchorKey: to, slug: saplingSlug });
    const replanted = await db.hollowPlacement.findUniqueOrThrow({
      where: { sceneId_anchorKey: { sceneId, anchorKey: to } },
    });
    expect(replanted.plantedAt.getTime()).toBeGreaterThan(planted.getTime());
  });

  it("swaps two standing furnishings without either losing its clock", async () => {
    const view = await open();
    const scene = view.scenes[0];
    const sceneId = scene?.id as string;
    const spots = scene?.anchors.filter(
      (a) => a.standing === null && a.maxSize === "MEDIUM",
    );
    const a = spots?.[0]?.key as string;
    const b = spots?.[1]?.key as string;
    if (!a || !b) return;

    await buy(saplingSlug, 2);
    const older = new Date(Date.now() - 40 * 86_400_000);
    await placeFurnishing(db, {
      userId,
      sceneId,
      anchorKey: a,
      slug: saplingSlug,
      now: older,
    });
    await placeFurnishing(db, { userId, sceneId, anchorKey: b, slug: saplingSlug });

    await moveFurnishing(db, {
      userId,
      fromSceneId: sceneId,
      fromAnchorKey: a,
      toSceneId: sceneId,
      toAnchorKey: b,
    });
    const nowAtB = await db.hollowPlacement.findUniqueOrThrow({
      where: { sceneId_anchorKey: { sceneId, anchorKey: b } },
    });
    expect(nowAtB.plantedAt.getTime()).toBe(older.getTime());
    expect(
      await db.hollowPlacement.count({ where: { sceneId, anchorKey: a } }),
    ).toBe(1);
  });

  it("grows on wall-clock time and never needs tending", async () => {
    // Derived from a timestamp on read, exactly as pet needs are: a player
    // away for a month comes back to a taller tree, not a dead one.
    const planted = new Date("2026-01-01T00:00:00Z");
    expect(growthStage(planted, 60, new Date("2026-01-01T00:00:00Z"))).toBe(0);
    expect(growthStage(planted, 60, new Date("2026-02-01T00:00:00Z"))).toBe(1);
    expect(growthStage(planted, 60, new Date("2026-04-01T00:00:00Z"))).toBe(
      GROWTH_STAGES - 1,
    );
    // Static things are simply always finished — one code path.
    expect(growthStage(planted, null, planted)).toBe(GROWTH_STAGES - 1);
  });

  it("will not touch another player's Hollow", async () => {
    const view = await open();
    const sceneId = view.scenes[0]?.id as string;
    const stranger = (
      await createTestUser(db, { username: `${prefix}_x${randomUUID().slice(0, 6)}` })
    ).id;
    await ensureHollow(db, stranger);

    await expectHollowError(
      setSceneCaption(db, { userId: stranger, sceneId, caption: "mine now" }),
      "SCENE_NOT_FOUND",
    );
    await expectHollowError(
      clearAnchor(db, {
        userId: stranger,
        sceneId,
        anchorKey: view.scenes[0]?.anchors[0]?.key as string,
      }),
      "SCENE_NOT_FOUND",
    );
  });

  it("reorders grounds without breaking the unique positions", async () => {
    await open();
    await purchaseGround(db, {
      userId,
      groundKey: groundKeys[1] as string,
      idempotencyKey: randomUUID(),
    });
    const before = await getHollow(db, { userId });
    const second = before?.scenes[1];
    await moveScene(db, { userId, sceneId: second?.id as string, direction: "up" });
    const after = await getHollow(db, { userId });
    expect(after?.scenes[0]?.id).toBe(second?.id);
    expect(after?.scenes.map((scene) => scene.position)).toEqual([0, 1]);

    // Past the end is a harmless no-op, not an error.
    await moveScene(db, { userId, sceneId: second?.id as string, direction: "up" });
    const unchanged = await getHollow(db, { userId });
    expect(unchanged?.scenes[0]?.id).toBe(second?.id);
  });

  it("refuses a caption longer than a caption", async () => {
    const view = await open();
    await expectHollowError(
      setSceneCaption(db, {
        userId,
        sceneId: view.scenes[0]?.id as string,
        caption: "x".repeat(200),
      }),
      "CAPTION_TOO_LONG",
    );
  });

  it("offers only what fits and is spare", async () => {
    await open();
    await buy(smallSlug, 2);
    const forSmall = await listPlaceable(db, { userId, maxSize: "SMALL" });
    const stone = forSmall.find((entry) => entry.slug === smallSlug);
    expect(stone?.spare).toBe(2);

    await buy(largeSlug, 1);
    expect(
      (await listPlaceable(db, { userId, maxSize: "SMALL" })).some(
        (entry) => entry.slug === largeSlug,
      ),
    ).toBe(false);
    expect(
      (await listPlaceable(db, { userId, maxSize: "CENTREPIECE" })).some(
        (entry) => entry.slug === largeSlug,
      ),
    ).toBe(true);
  });

  it("never exposes a total, a fraction, or a rarity", async () => {
    // These assertions are the feature. A Hollow is composition, not
    // acquisition, and design-philosophy.md forbids developer-defined
    // collections by name — so the view models are pinned to shapes with
    // nowhere to put "12 of 40".
    await open();
    await buy(smallSlug, 1);

    const view = await getHollow(db, { userId });
    expect(Object.keys(view ?? {}).sort()).toEqual([
      "airs",
      "grounds",
      "nextGroundPrice",
      "sceneCount",
      "scenes",
    ]);

    const entries = await listCatalogue(db, { userId });
    const sample = entries[0];
    expect(sample).toBeDefined();
    expect(Object.keys(sample ?? {}).sort()).toEqual([
      "artKey",
      "description",
      "growthDays",
      "itemId",
      "name",
      "owned",
      "placed",
      "price",
      "size",
      "slug",
    ]);
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toMatch(/rarity/i);
    expect(serialized).not.toMatch(/total/i);
    expect(serialized).not.toMatch(/percent/i);
  });

  it("stops showing and stops accepting a furnishing that has been pulled", async () => {
    // DISABLED is the moderation kill switch and means inert everywhere
    // (docs/conventions.md). Before this it reached only the buy path: a
    // pulled furnishing kept standing on every public page and could still
    // be newly placed.
    const view = await open();
    const scene = view.scenes[0];
    const sceneId = scene?.id as string;
    const spot = scene?.anchors.find(
      (a) => a.standing === null && a.maxSize !== "SMALL",
    );
    await buy(saplingSlug, 2);
    await placeFurnishing(db, {
      userId,
      sceneId,
      anchorKey: spot?.key as string,
      slug: saplingSlug,
    });
    expect(
      (await getHollow(db, { userId }))?.scenes[0]?.anchors.some(
        (a) => a.standing?.slug === saplingSlug,
      ),
    ).toBe(true);

    await db.item.update({
      where: { slug: saplingSlug },
      data: { lifecycle: "DISABLED" },
    });
    try {
      const pulled = await getHollow(db, { userId });
      expect(
        pulled?.scenes[0]?.anchors.some((a) => a.standing?.slug === saplingSlug),
      ).toBe(false);
      const publicScenes = await getPublicHollow(db, { username });
      expect(
        publicScenes[0]?.anchors.some((a) => a.standing?.slug === saplingSlug),
      ).toBe(false);

      const other = scene?.anchors.find(
        (a) => a.standing === null && a.key !== spot?.key && a.maxSize !== "SMALL",
      );
      await expectHollowError(
        placeFurnishing(db, {
          userId,
          sceneId,
          anchorKey: other?.key as string,
          slug: saplingSlug,
        }),
        "UNKNOWN_FURNISHING",
      );
    } finally {
      await db.item.update({
        where: { slug: saplingSlug },
        data: { lifecycle: "ACTIVE" },
      });
    }
  });

  it("still lets a player arrange a retired furnishing they already own", async () => {
    // RETIRED stops NEW copies entering circulation. It must never mean
    // "the ones you paid for are frozen where they stand".
    const view = await open();
    const scene = view.scenes[0];
    const spot = scene?.anchors.find(
      (a) => a.standing === null && a.maxSize !== "SMALL",
    );
    await buy(largeSlug, 1);
    await db.item.update({
      where: { slug: largeSlug },
      data: { lifecycle: "RETIRED" },
    });
    try {
      const offered = await listPlaceable(db, { userId, maxSize: "CENTREPIECE" });
      expect(offered.some((entry) => entry.slug === largeSlug)).toBe(true);
      await placeFurnishing(db, {
        userId,
        sceneId: scene?.id as string,
        anchorKey: spot?.key as string,
        slug: largeSlug,
      });
      // …but it is no longer for sale.
      const forSale = await listCatalogue(db, { userId });
      expect(forSale.some((entry) => entry.slug === largeSlug)).toBe(false);
    } finally {
      await db.item.update({
        where: { slug: largeSlug },
        data: { lifecycle: "ACTIVE" },
      });
    }
  });

  it("accounts for the furnishings a new Hollow opens with", async () => {
    // 680 coins of catalogue value entering a satchel with nothing in the
    // ledger to explain it: invisible in /history and to reconciliation.
    await open();
    const rows = await db.transaction.findMany({
      where: { userId, type: "STARTER_GRANT" },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.itemId !== null)).toBe(true);
    expect(rows.every((row) => row.coinsDelta === 0n)).toBe(true);
  });

  it("refuses a nonsensical quantity in words that fit the mistake", async () => {
    await open();
    await expectHollowError(
      purchaseFurnishing(db, {
        userId,
        slug: smallSlug,
        quantity: 0,
        idempotencyKey: randomUUID(),
      }),
      "INVALID_QUANTITY",
    );
  });

  it("returns a furnishing to the player when its anchor stops existing", async () => {
    // A placement pointing at a vanished anchor is worse than a deleted
    // one: it renders nowhere, still counts against the placed total so
    // the copy is offered nowhere else, and no clear control can reach it.
    // The seeder deletes those placements with the anchor; this proves the
    // copy comes back rather than being stranded.
    const view = await open();
    const scene = view.scenes[0];
    const sceneId = scene?.id as string;
    const spot = scene?.anchors.find(
      (a) => a.standing === null && a.maxSize !== "SMALL",
    );
    await buy(largeSlug, 1);
    await placeFurnishing(db, {
      userId,
      sceneId,
      anchorKey: spot?.key as string,
      slug: largeSlug,
    });
    expect(
      (await listPlaceable(db, { userId, maxSize: "CENTREPIECE" })).some(
        (entry) => entry.slug === largeSlug,
      ),
    ).toBe(false);

    // What seedHollow does when a ground's authored anchors change.
    const groundId = (
      await db.hollowScene.findUniqueOrThrow({ where: { id: sceneId } })
    ).groundId;
    const survivors = scene?.anchors
      .filter((a) => a.key !== spot?.key)
      .map((a) => a.key) as string[];
    await db.hollowPlacement.deleteMany({
      where: { scene: { groundId }, anchorKey: { notIn: survivors } },
    });

    // The copy is spare again, and nothing invisible is holding it.
    expect(
      (await listPlaceable(db, { userId, maxSize: "CENTREPIECE" })).some(
        (entry) => entry.slug === largeSlug,
      ),
    ).toBe(true);
  });

  it("sorts the catalogue by price and by nothing else", async () => {
    await open();
    const entries = await listCatalogue(db, { userId });
    const prices = entries.map((entry) => BigInt(entry.price));
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i] as bigint).toBeGreaterThanOrEqual(prices[i - 1] as bigint);
    }
  });
});
