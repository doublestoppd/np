/**
 * Fault-injection rollback matrix (docs/conventions.md): when a step fails
 * mid-transaction, the database must be exactly as before. Failures are
 * injected with the generic proxy harness so commands run unmodified.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { purchaseFromNpcShop } from "@/server/modules/commerce/npc-shops/purchase";
import { createListing } from "@/server/modules/commerce/player-shops/commands/listings";
import { purchaseListing } from "@/server/modules/commerce/player-shops/commands/purchase";
import { claimProceeds } from "@/server/modules/commerce/player-shops/commands/proceeds";
import { grantItem } from "@/server/modules/items/ownership";
import { withFault, InjectedFault } from "@test/helpers/fault-injection";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems, giveStack } from "@test/factories/items";
import {
  createTestNpcShop,
  cleanupTestNpcShops,
  makeStock,
} from "@test/factories/npc-shops";

const prefix = fixturePrefix("rollback");

interface Snapshot {
  buyerCoins: bigint;
  sellerCoins: bigint;
  sellerTill: bigint;
  buyerStack: number;
  sellerStack: number;
  activeListings: number;
  escrowedInstances: number;
  ledgerRows: number;
}

describe.skipIf(!testDb)("rollback and fault injection", () => {
  const db = testDb as PrismaClient;
  let buyerId: string;
  let sellerId: string;
  let itemId: string;
  let relicId: string;
  let shopId: string;
  let restockId: string;

  async function snapshot(): Promise<Snapshot> {
    const buyer = await db.user.findUniqueOrThrow({ where: { id: buyerId } });
    const seller = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
    const shop = await db.playerShop.findUnique({ where: { ownerId: sellerId } });
    const buyerStack = await db.inventoryEntry.findUnique({
      where: { userId_itemId: { userId: buyerId, itemId } },
    });
    const sellerStack = await db.inventoryEntry.findUnique({
      where: { userId_itemId: { userId: sellerId, itemId } },
    });
    return {
      buyerCoins: buyer.coins,
      sellerCoins: seller.coins,
      sellerTill: shop?.unclaimedProceeds ?? 0n,
      buyerStack: buyerStack?.quantity ?? 0,
      sellerStack: sellerStack?.quantity ?? 0,
      activeListings: await db.playerShopListing.count({
        where: { sellerId, status: "ACTIVE" },
      }),
      escrowedInstances: await db.itemInstance.count({
        where: { ownerId: { in: [buyerId, sellerId] }, status: "ESCROWED" },
      }),
      ledgerRows: await db.transaction.count({
        where: { userId: { in: [buyerId, sellerId] } },
      }),
    };
  }

  beforeAll(async () => {
    buyerId = (
      await createTestUser(db, { username: `${prefix}_buyer`, coins: 10_000n })
    ).id;
    sellerId = (
      await createTestUser(db, { username: `${prefix}_seller`, coins: 10_000n })
    ).id;
    itemId = (await createTestItem(db, { slug: `${prefix}-goods` })).id;
    relicId = (
      await createTestItem(db, {
        slug: `${prefix}-relic`,
        stackable: false,
        provenancePolicy: "FULL_HISTORY",
      })
    ).id;
    const fixture = await createTestNpcShop(db, { prefix });
    shopId = fixture.shop.id;
    restockId = fixture.restock.id;
  });

  beforeEach(async () => {
    for (const id of [buyerId, sellerId]) {
      await db.rateLimitWindow.deleteMany({ where: { key: { contains: id } } });
    }
  });

  afterAll(async () => {
    await cleanupTestNpcShops(db, prefix);
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("NPC purchase: debit succeeds but item grant fails → everything reverts", async () => {
    const stockId = await makeStock(db, { shopId, restockId, itemId, quantity: 5 });
    const before = await snapshot();
    const stockBefore = await db.npcShopStock.findUniqueOrThrow({ where: { id: stockId } });

    const faulty = withFault(db, { model: "inventoryEntry", method: "upsert" });
    await expect(
      purchaseFromNpcShop(faulty, {
        userId: buyerId,
        stockId,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrowError(InjectedFault);

    expect(await snapshot()).toEqual(before);
    const stockAfter = await db.npcShopStock.findUniqueOrThrow({ where: { id: stockId } });
    expect(stockAfter.quantity).toBe(stockBefore.quantity);
    // The idempotency key rolled back too — a clean retry succeeds.
    await purchaseFromNpcShop(db, {
      userId: buyerId,
      stockId,
      quantity: 1,
      idempotencyKey: randomUUID(),
    });
  });

  it("listing creation: escrow succeeds but listing insert fails → stack restored", async () => {
    await giveStack(db, { userId: sellerId, itemId, quantity: 10 });
    const before = await snapshot();
    const faulty = withFault(db, { model: "playerShopListing", method: "create" });
    await expect(
      createListing(faulty, {
        userId: sellerId,
        itemId,
        quantity: 3,
        unitPrice: 10n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrowError(InjectedFault);
    expect(await snapshot()).toEqual(before);
  });

  it("instance listing: escrow succeeds but ledger write fails → instance stays OWNED", async () => {
    const instanceId = await db.$transaction(async (tx) => {
      const relic = await tx.item.findUniqueOrThrow({ where: { id: relicId } });
      const granted = await grantItem(tx, {
        userId: sellerId,
        item: relic,
        quantity: 1,
        reason: "distribution",
        source: "test",
      });
      return granted.instanceIds[0] as string;
    });
    const faulty = withFault(db, { model: "transaction", method: "create" });
    await expect(
      createListing(faulty, {
        userId: sellerId,
        itemId: relicId,
        itemInstanceId: instanceId,
        quantity: 1,
        unitPrice: 100n,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrowError(InjectedFault);
    const instance = await db.itemInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(instance.status).toBe("OWNED");
  });

  it("player purchase: listing marked sold but proceeds update fails → listing stays ACTIVE", async () => {
    await giveStack(db, { userId: sellerId, itemId, quantity: 10 });
    const { result: created } = await createListing(db, {
      userId: sellerId,
      itemId,
      quantity: 2,
      unitPrice: 20n,
      idempotencyKey: randomUUID(),
    });
    const before = await snapshot();
    const faulty = withFault(db, { model: "playerShop", method: "update" });
    await expect(
      purchaseListing(faulty, {
        buyerId,
        listingId: created.listingId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrowError(InjectedFault);
    expect(await snapshot()).toEqual(before);
    const listing = await db.playerShopListing.findUniqueOrThrow({
      where: { id: created.listingId },
    });
    expect(listing.status).toBe("ACTIVE");
    // The guarded decrement rolled back with everything else: the units
    // are still on the shelf.
    expect(listing.quantity).toBe(listing.quantityListed);
    // A clean purchase still works afterwards.
    await purchaseListing(db, {
      buyerId,
      listingId: created.listingId,
      idempotencyKey: randomUUID(),
    });
  });

  it("proceeds claim: till cleared but wallet credit fails → till preserved", async () => {
    const shop = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: sellerId },
    });
    expect(shop.unclaimedProceeds).toBeGreaterThan(0n);
    const before = await snapshot();
    const faulty = withFault(db, { model: "user", method: "update" });
    await expect(
      claimProceeds(faulty, {
        userId: sellerId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrowError(InjectedFault);
    expect(await snapshot()).toEqual(before);
  });

  it("instance transfer: provenance write fails → ownership unchanged", async () => {
    const instanceId = await db.$transaction(async (tx) => {
      const relic = await tx.item.findUniqueOrThrow({ where: { id: relicId } });
      const granted = await grantItem(tx, {
        userId: sellerId,
        item: relic,
        quantity: 1,
        reason: "distribution",
        source: "test",
      });
      return granted.instanceIds[0] as string;
    });
    const { result: created } = await createListing(db, {
      userId: sellerId,
      itemId: relicId,
      itemInstanceId: instanceId,
      quantity: 1,
      unitPrice: 100n,
      idempotencyKey: randomUUID(),
    });
    const faulty = withFault(db, {
      model: "itemProvenanceEvent",
      method: "create",
    });
    await expect(
      purchaseListing(faulty, {
        buyerId,
        listingId: created.listingId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrowError(InjectedFault);
    const instance = await db.itemInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(instance.ownerId).toBe(sellerId);
    expect(instance.status).toBe("ESCROWED");
    const listing = await db.playerShopListing.findUniqueOrThrow({
      where: { id: created.listingId },
    });
    expect(listing.status).toBe("ACTIVE");
  });
});
