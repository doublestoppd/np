/** Listing commands: escrow, price updates, cancellation, capacity, policy. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ensurePlayerShop } from "./commands/shop";
import { cancelListing, createListing, updateListingPrice } from "./commands/listings";
import { EconomyError } from "../errors";
import { BASE_SHOP_CAPACITY } from "../config";
import { grantItem } from "@/server/modules/items/ownership";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems, giveStack } from "@test/factories/items";

const prefix = fixturePrefix("plist");

async function expectEconomyError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(EconomyError);
  expect((error as EconomyError).economyCode).toBe(code);
}

describe.skipIf(!testDb)("player-shop listings (integration)", () => {
  const db = testDb as PrismaClient;
  let sellerId: string;
  let stackItemId: string;
  let nontradeableId: string;
  let retiredItemId: string;
  let disabledItemId: string;

  beforeAll(async () => {
    sellerId = (
      await createTestUser(db, { username: `${prefix}_seller`, coins: 50_000n })
    ).id;
    stackItemId = (await createTestItem(db, { slug: `${prefix}-berries` })).id;
    nontradeableId = (
      await createTestItem(db, { slug: `${prefix}-bound`, tradeable: false })
    ).id;
    retiredItemId = (
      await createTestItem(db, { slug: `${prefix}-retired`, lifecycle: "RETIRED" })
    ).id;
    disabledItemId = (
      await createTestItem(db, { slug: `${prefix}-off`, lifecycle: "DISABLED" })
    ).id;
  });

  beforeEach(async () => {
    await db.rateLimitWindow.deleteMany({
      where: { key: { contains: sellerId } },
    });
    await giveStack(db, { userId: sellerId, itemId: stackItemId, quantity: 50 });
  });

  afterAll(async () => {
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("creates the shop lazily with base capacity and a normalized slug", async () => {
    const shop = await ensurePlayerShop(db, sellerId);
    expect(shop.listingCapacity).toBe(BASE_SHOP_CAPACITY);
    expect(shop.slug).toBe(`${prefix}_seller`.toLowerCase());
  });

  it("escrows a partial stack on listing and returns it on cancel", async () => {
    const before = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: sellerId, itemId: stackItemId } },
    });
    const { result: created } = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 10,
      unitPrice: 25n,
      idempotencyKey: randomUUID(),
    });
    const after = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: sellerId, itemId: stackItemId } },
    });
    expect(after.quantity).toBe(before.quantity - 10);

    await updateListingPrice(db, {
      userId: sellerId,
      listingId: created.listingId,
      unitPrice: 42n,
      idempotencyKey: randomUUID(),
    });
    expect(
      (
        await db.playerShopListing.findUniqueOrThrow({
          where: { id: created.listingId },
        })
      ).unitPrice,
    ).toBe(42n);

    await cancelListing(db, {
      userId: sellerId,
      listingId: created.listingId,
      idempotencyKey: randomUUID(),
    });
    const restored = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: sellerId, itemId: stackItemId } },
    });
    expect(restored.quantity).toBe(before.quantity);
    await expectEconomyError(
      updateListingPrice(db, {
        userId: sellerId,
        listingId: created.listingId,
        unitPrice: 50n,
        idempotencyKey: randomUUID(),
      }),
      "LISTING_NOT_ACTIVE",
    );
  });

  it("records a reprice in history and replays a duplicate submission", async () => {
    const { result: created } = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      itemInstanceId: null,
      quantity: 4,
      unitPrice: 30n,
      idempotencyKey: randomUUID(),
    });

    const key = randomUUID();
    const params = {
      userId: sellerId,
      listingId: created.listingId,
      unitPrice: 45n,
      idempotencyKey: key,
    };
    const first = await updateListingPrice(db, params);
    expect(first.result.previousUnitPrice).toBe("30");
    expect(first.result.unitPrice).toBe("45");

    // A reprice changes the terms of goods already in escrow, so it is in
    // the seller's history like every other economic mutation.
    const ledger = await db.transaction.findMany({
      where: {
        userId: sellerId,
        type: "PLAYER_LISTING_REPRICE",
        playerListingId: created.listingId,
      },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.coinsDelta).toBe(0n);
    expect(ledger[0]!.note).toMatch(/from 30 to 45/);

    const retry = await updateListingPrice(db, params);
    expect(retry.replayed).toBe(true);
    expect(retry.result).toEqual(first.result);
    // The replay wrote no second history row.
    expect(
      await db.transaction.count({
        where: {
          type: "PLAYER_LISTING_REPRICE",
          playerListingId: created.listingId,
        },
      }),
    ).toBe(1);

    await cancelListing(db, {
      userId: sellerId,
      listingId: created.listingId,
      idempotencyKey: randomUUID(),
    });
  });

  it("never loses a reprice: history and the shelf always agree", async () => {
    const { result: created } = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      itemInstanceId: null,
      quantity: 2,
      unitPrice: 20n,
      idempotencyKey: randomUUID(),
    });

    // Two concurrent repricings. Either they serialize and both land, or
    // one reads a price the other has already replaced and its guard
    // refuses it — never a silent lost update. Whichever happens, the
    // shelf must show a price that was actually asked for, and history
    // must contain exactly one row per reprice that succeeded.
    const results = await Promise.allSettled([
      updateListingPrice(db, {
        userId: sellerId,
        listingId: created.listingId,
        unitPrice: 25n,
        idempotencyKey: randomUUID(),
      }),
      updateListingPrice(db, {
        userId: sellerId,
        listingId: created.listingId,
        unitPrice: 35n,
        idempotencyKey: randomUUID(),
      }),
    ]);
    const landed = results.filter((r) => r.status === "fulfilled");
    expect(landed.length).toBeGreaterThan(0);

    const listing = await db.playerShopListing.findUniqueOrThrow({
      where: { id: created.listingId },
    });
    expect([25n, 35n]).toContain(listing.unitPrice);
    expect(
      await db.transaction.count({
        where: {
          type: "PLAYER_LISTING_REPRICE",
          playerListingId: created.listingId,
        },
      }),
    ).toBe(landed.length);

    // Whatever the shelf says now is what the last successful reprice
    // asked for — a lost update would leave these disagreeing.
    const lastNote = (
      await db.transaction.findFirstOrThrow({
        where: {
          type: "PLAYER_LISTING_REPRICE",
          playerListingId: created.listingId,
        },
        orderBy: { createdAt: "desc" },
      })
    ).note;
    expect(lastNote).toContain(`to ${listing.unitPrice}`);

    await cancelListing(db, {
      userId: sellerId,
      listingId: created.listingId,
      idempotencyKey: randomUUID(),
    });
  });

  it("idempotent create: retrying the same key yields one listing", async () => {
    const key = randomUUID();
    const { result: first } = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 2,
      unitPrice: 7n,
      idempotencyKey: key,
    });
    const { result: retry } = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 2,
      unitPrice: 7n,
      idempotencyKey: key,
    });
    expect(retry.listingId).toBe(first.listingId);
  });

  it("will not let a freshly made account trade with anybody", async () => {
    // Twelve throwaway accounts, each signed up, paid its starter grant,
    // spun the wheel, solved the shared daily word and then bought a junk
    // item from the farmer's stall priced at exactly its balance: 5,834
    // coins in twelve accounts at 21.8 seconds each. Everything else is a
    // tax on a machine that still works; this stops the machine.
    const fresh = await createTestUser(db, {
      username: `${prefix}_fresh_${randomUUID().slice(0, 6)}`,
      createdAt: new Date(),
    });
    await giveStack(db, { userId: fresh.id, itemId: stackItemId, quantity: 1 });
    await expectEconomyError(
      createListing(db, {
        userId: fresh.id,
        itemId: stackItemId,
        quantity: 1,
        unitPrice: 10n,
        idempotencyKey: randomUUID(),
      }),
      "ACCOUNT_TOO_NEW",
    );

    // And the day after, they are an ordinary player.
    await db.user.update({
      where: { id: fresh.id },
      data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
    });
    await createListing(db, {
      userId: fresh.id,
      itemId: stackItemId,
      quantity: 1,
      unitPrice: 10n,
      idempotencyKey: randomUUID(),
    });
  });

  it("enforces item policy: nontradeable and DISABLED rejected, RETIRED allowed", async () => {
    await giveStack(db, { userId: sellerId, itemId: nontradeableId, quantity: 1 });
    await expectEconomyError(
      createListing(db, {
        userId: sellerId,
        itemId: nontradeableId,
        quantity: 1,
        unitPrice: 10n,
        idempotencyKey: randomUUID(),
      }),
      "NOT_TRADEABLE",
    );

    await giveStack(db, { userId: sellerId, itemId: disabledItemId, quantity: 1 });
    await expectEconomyError(
      createListing(db, {
        userId: sellerId,
        itemId: disabledItemId,
        quantity: 1,
        unitPrice: 10n,
        idempotencyKey: randomUUID(),
      }),
      "ITEM_INACTIVE",
    );

    await giveStack(db, { userId: sellerId, itemId: retiredItemId, quantity: 1 });
    const { result: retired } = await createListing(db, {
      userId: sellerId,
      itemId: retiredItemId,
      quantity: 1,
      unitPrice: 10n,
      idempotencyKey: randomUUID(),
    });
    expect(retired.listingId).toBeTruthy();
  });

  it("commerce-disabled sellers cannot create but CAN cancel", async () => {
    const { result: created } = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 1,
      unitPrice: 9n,
      idempotencyKey: randomUUID(),
    });
    await db.user.update({
      where: { id: sellerId },
      data: { commerceDisabledAt: new Date() },
    });
    try {
      await expectEconomyError(
        createListing(db, {
          userId: sellerId,
          itemId: stackItemId,
          quantity: 1,
          unitPrice: 9n,
          idempotencyKey: randomUUID(),
        }),
        "COMMERCE_DISABLED",
      );
      // Cancellation (recovering their own goods) remains allowed.
      await cancelListing(db, {
        userId: sellerId,
        listingId: created.listingId,
        idempotencyKey: randomUUID(),
      });
      const listing = await db.playerShopListing.findUniqueOrThrow({
        where: { id: created.listingId },
      });
      expect(listing.status).toBe("CANCELLED");
    } finally {
      await db.user.update({
        where: { id: sellerId },
        data: { commerceDisabledAt: null },
      });
    }
  });

  it("accepts bounded high prices and enforces capacity with upgrades pending", async () => {
    const { result: big } = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 1,
      unitPrice: 1_000_000_000n,
      idempotencyKey: randomUUID(),
    });
    expect(big.unitPrice).toBe("1000000000");
    await expectEconomyError(
      createListing(db, {
        userId: sellerId,
        itemId: stackItemId,
        quantity: 1,
        unitPrice: 1_000_000_001n,
        idempotencyKey: randomUUID(),
      }),
      "INVALID_PRICE",
    );

    const capped = await createTestUser(db, {
      username: `${prefix}_cap`,
      coins: 10_000n,
    });
    await giveStack(db, { userId: capped.id, itemId: stackItemId, quantity: 100 });
    const shop = await ensurePlayerShop(db, capped.id);
    for (let i = 0; i < shop.listingCapacity; i++) {
      await createListing(db, {
        userId: capped.id,
        itemId: stackItemId,
        quantity: 1,
        unitPrice: BigInt(10 + i),
        idempotencyKey: randomUUID(),
      });
    }
    await expectEconomyError(
      createListing(db, {
        userId: capped.id,
        itemId: stackItemId,
        quantity: 1,
        unitPrice: 999n,
        idempotencyKey: randomUUID(),
      }),
      "CAPACITY_FULL",
    );
  });

  it("instance listings escrow the copy and block double-listing", async () => {
    const relic = await createTestItem(db, {
      slug: `${prefix}-relic`,
      stackable: false,
      provenancePolicy: "FULL_HISTORY",
    });
    const instanceId = await db.$transaction(async (tx) => {
      const granted = await grantItem(tx, {
        userId: sellerId,
        item: relic,
        quantity: 1,
        reason: "distribution",
        source: "test",
      });
      return granted.instanceIds[0] as string;
    });
    await createListing(db, {
      userId: sellerId,
      itemId: relic.id,
      itemInstanceId: instanceId,
      quantity: 1,
      unitPrice: 1_500n,
      idempotencyKey: randomUUID(),
    });
    const escrowed = await db.itemInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(escrowed.status).toBe("ESCROWED");
    await expectEconomyError(
      createListing(db, {
        userId: sellerId,
        itemId: relic.id,
        itemInstanceId: instanceId,
        quantity: 1,
        unitPrice: 1n,
        idempotencyKey: randomUUID(),
      }),
      "INSTANCE_NOT_OWNED",
    );
  });
});
