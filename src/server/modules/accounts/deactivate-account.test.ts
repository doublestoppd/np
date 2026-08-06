/**
 * Account deactivation: escrow returned, earned proceeds claimed, shop
 * closed, sessions invalidated, history preserved — and the whole thing is
 * a no-op when repeated (docs/conventions.md).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { deactivateAccount } from "./commands/deactivate-account";
import { createListing } from "@/server/modules/commerce/player-shops/commands/listings";
import { purchaseListing } from "@/server/modules/commerce/player-shops/commands/purchase";
import { getPublicShop } from "@/server/modules/commerce/player-shops/queries";
import { grantItem } from "@/server/modules/items/ownership";
import { getPublicProfile } from "@/server/modules/profiles/profile";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems, giveStack } from "@test/factories/items";

const prefix = fixturePrefix("deact");

describe.skipIf(!testDb)("account deactivation (integration)", () => {
  const db = testDb as PrismaClient;
  let sellerId: string;
  let buyerId: string;
  let itemId: string;
  let instanceId: string;
  let stackListingId: string;

  beforeAll(async () => {
    sellerId = (
      await createTestUser(db, { username: `${prefix}_seller`, coins: 5_000n })
    ).id;
    buyerId = (
      await createTestUser(db, { username: `${prefix}_buyer`, coins: 5_000n })
    ).id;
    itemId = (await createTestItem(db, { slug: `${prefix}-goods` })).id;
    const relic = await createTestItem(db, {
      slug: `${prefix}-relic`,
      stackable: false,
      provenancePolicy: "FULL_HISTORY",
    });
    instanceId = await db.$transaction(async (tx) => {
      const granted = await grantItem(tx, {
        userId: sellerId,
        item: relic,
        quantity: 1,
        source: "test",
      });
      return granted.instanceIds[0] as string;
    });
    await giveStack(db, { userId: sellerId, itemId, quantity: 20 });

    // One sold listing (funds the till), one active stack listing, one
    // active instance listing, and two live sessions.
    const { result: sold } = await createListing(db, {
      userId: sellerId,
      itemId,
      quantity: 2,
      unitPrice: 50n,
      idempotencyKey: randomUUID(),
    });
    await purchaseListing(db, {
      buyerId,
      listingId: sold.listingId,
      idempotencyKey: randomUUID(),
    });
    stackListingId = (
      await createListing(db, {
        userId: sellerId,
        itemId,
        quantity: 5,
        unitPrice: 30n,
        idempotencyKey: randomUUID(),
      })
    ).result.listingId;
    await createListing(db, {
      userId: sellerId,
      itemId: relic.id,
      itemInstanceId: instanceId,
      quantity: 1,
      unitPrice: 900n,
      idempotencyKey: randomUUID(),
    });
    for (let i = 0; i < 2; i++) {
      await db.session.create({
        data: {
          tokenHash: randomUUID(),
          userId: sellerId,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
    }
  });

  afterAll(async () => {
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("closes the account safely and preserves every historical record", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
    const stackBefore = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: sellerId, itemId } },
    });
    const shopBefore = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: sellerId },
    });
    expect(shopBefore.unclaimedProceeds).toBe(100n);
    const ledgerBefore = await db.transaction.count({
      where: { userId: sellerId },
    });

    const result = await deactivateAccount(db, {
      userId: sellerId,
      reason: "test-closure",
    });
    expect(result.cancelledListings).toBe(2);
    expect(result.claimedProceeds).toBe(100n);

    // Escrow returned: the stack came back, the instance is OWNED again.
    const stackAfter = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: sellerId, itemId } },
    });
    expect(stackAfter.quantity).toBe(stackBefore.quantity + 5);
    const instance = await db.itemInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(instance.ownerId).toBe(sellerId);
    expect(instance.status).toBe("OWNED");

    // Proceeds were theirs: credited to the wallet before closing.
    const after = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
    expect(after.coins).toBe(before.coins + 100n);
    expect(after.deactivatedAt).not.toBeNull();

    // Shop closed, sessions gone.
    const shopAfter = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: sellerId },
    });
    expect(shopAfter.active).toBe(false);
    expect(shopAfter.unclaimedProceeds).toBe(0n);
    expect(await db.session.count({ where: { userId: sellerId } })).toBe(0);

    // History preserved and extended, never destroyed: prior rows plus two
    // cancellations and the proceeds claim.
    const ledgerAfter = await db.transaction.findMany({
      where: { userId: sellerId },
    });
    expect(ledgerAfter.length).toBe(ledgerBefore + 3);
    expect(
      ledgerAfter.filter((row) => row.type === "PLAYER_LISTING_CANCEL"),
    ).toHaveLength(2);
    const claim = ledgerAfter.find((row) => row.type === "PROCEEDS_CLAIM");
    expect(claim?.coinsDelta).toBe(100n);
    const audit = await db.securityEvent.findFirst({
      where: { userId: sellerId, type: "account-deactivated" },
    });
    expect(audit).not.toBeNull();
    const cancelled = await db.playerShopListing.findUniqueOrThrow({
      where: { id: stackListingId },
    });
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("hides the account from public reads and authentication lookups", async () => {
    expect(await getPublicProfile(db, `${prefix}_seller`)).toBeNull();
    expect(await getPublicShop(db, `${prefix}_seller`.toLowerCase())).toBeNull();
    // The exact predicate sign-in and session resolution use.
    const authRow = await db.user.findFirst({
      where: {
        normalizedUsername: `${prefix}_seller`.toLowerCase(),
        deactivatedAt: null,
      },
    });
    expect(authRow).toBeNull();
  });

  it("is idempotent: a second deactivation changes nothing", async () => {
    const ledgerBefore = await db.transaction.count({
      where: { userId: sellerId },
    });
    const again = await deactivateAccount(db, {
      userId: sellerId,
      reason: "repeat",
    });
    expect(again).toEqual({ cancelledListings: 0, claimedProceeds: 0n });
    expect(await db.transaction.count({ where: { userId: sellerId } })).toBe(
      ledgerBefore,
    );
  });
});
