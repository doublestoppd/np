/**
 * Database-level safeguard tests: the CHECK constraints and partial
 * indexes in prisma/migrations/0_init/migration.sql that Prisma cannot
 * express, and that the domain layer therefore cannot be the only thing
 * enforcing.
 *
 * Assertions name the constraint they expect rather than only asserting a
 * throw — a typo'd column name also throws, and would otherwise read as
 * "the constraint works".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";
import { createTestNpcShop, cleanupTestNpcShops } from "@test/factories/npc-shops";

const prefix = fixturePrefix("integ");

describe.skipIf(!testDb)("database integrity constraints", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let itemId: string;
  let shopId: string;
  let restockId: string;

  beforeAll(async () => {
    userId = (await createTestUser(db, { username: `${prefix}_user` })).id;
    itemId = (await createTestItem(db, { slug: `${prefix}-item` })).id;
    const fixture = await createTestNpcShop(db, { prefix });
    shopId = fixture.shop.id;
    restockId = fixture.restock.id;
  });

  afterAll(async () => {
    await cleanupTestNpcShops(db, prefix);
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("rejects negative wallet balances", async () => {
    await expect(
      db.user.update({ where: { id: userId }, data: { coins: -1n } }),
    ).rejects.toThrow();
  });

  it("rejects negative inventory and item prices", async () => {
    await expect(
      db.inventoryEntry.create({ data: { userId, itemId, quantity: -2 } }),
    ).rejects.toThrow();
    await expect(
      db.item.create({
        data: {
          slug: `${prefix}-cursed`,
          name: "x",
          description: "",
          artKey: "x",
          price: -1n,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects provenance policies on stackable items", async () => {
    await expect(
      db.item.create({
        data: {
          slug: `${prefix}-bad-prov`,
          name: "x",
          description: "",
          artKey: "x",
          price: 1n,
          stackable: true,
          provenancePolicy: "FULL_HISTORY",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid restock configurations", async () => {
    await expect(
      db.npcShopRestockConfig.update({
        where: { shopId },
        data: { intervalMinutes: 0 },
      }),
    ).rejects.toThrow();
    await expect(
      db.npcShopRestockConfig.update({
        where: { shopId },
        data: { ultraRareBps: 10_001 },
      }),
    ).rejects.toThrow();
    await expect(
      db.npcShopRestockConfig.update({
        where: { shopId },
        data: { commonMin: 5, commonMax: 4 },
      }),
    ).rejects.toThrow();
  });

  it("rejects NPC stock with remaining quantity above initial", async () => {
    await expect(
      db.npcShopStock.create({
        data: {
          shopId,
          itemId,
          restockId,
          price: 5n,
          quantity: 10,
          initialQuantity: 5,
          status: "ACTIVE",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects non-positive upgrade tiers", async () => {
    await expect(
      db.playerShopUpgradeTier.create({
        data: { tier: 9_991, name: "x", price: 0n, capacityBonus: 4 },
      }),
    ).rejects.toThrow();
    await expect(
      db.playerShopUpgradeTier.create({
        data: { tier: 9_992, name: "x", price: 10n, capacityBonus: 0 },
      }),
    ).rejects.toThrow();
  });

  /** Asserts the named CHECK is what refused the write, not a typo. */
  async function expectConstraint(
    promise: Promise<unknown>,
    constraint: string,
  ): Promise<void> {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).toContain(constraint);
  }

  it("keeps a listing's remaining quantity within what was listed", async () => {
    // The newest and most load-bearing partial-purchase invariant: a
    // listing's remaining count can never exceed the count it was created
    // with, whatever a concurrent purchase does.
    const shop = await db.playerShop.create({
      data: {
        ownerId: userId,
        slug: `${prefix}-shop-q`,
        name: "Quantity fixture",
        description: "",
        listingCapacity: 10,
      },
    });
    const listing = await db.playerShopListing.create({
      data: {
        shopId: shop.id,
        sellerId: userId,
        itemId,
        quantity: 3,
        quantityListed: 3,
        unitPrice: 10n,
      },
    });
    await expectConstraint(
      db.playerShopListing.update({
        where: { id: listing.id },
        data: { quantity: 4 },
      }),
      "PlayerShopListing_quantity_within_listed",
    );
    // Down to zero is fine — that is a sold-out listing.
    await db.playerShopListing.update({
      where: { id: listing.id },
      data: { quantity: 0 },
    });
    // Below zero is refused by the nonnegative constraint, which sits
    // inside the within-listed one; naming them apart is the point.
    await expectConstraint(
      db.playerShopListing.update({
        where: { id: listing.id },
        data: { quantity: -1 },
      }),
      "PlayerShopListing_quantity_nonnegative",
    );
    await db.playerShopListing.delete({ where: { id: listing.id } });
    await db.playerShop.delete({ where: { id: shop.id } });
  });

  it("requires a request reward to be positive", async () => {
    // The premise a zero-reward code branch was once written against.
    const board = await db.requestBoard.create({
      data: {
        key: `${prefix}-board`,
        name: "Fixture",
        description: "",
      },
    });
    await expectConstraint(
      db.requestDefinition.create({
        data: {
          boardId: board.id,
          slug: `${prefix}-free`,
          title: "Free",
          flavorText: "",
          sequencePosition: 0,
          rewardCoins: 0n,
        },
      }),
      "RequestDefinition_reward_positive",
    );
    await db.requestBoard.delete({ where: { id: board.id } });
  });

  it("requires a game date to be a UTC calendar day", async () => {
    // Every daily activity keys off this string; a stray format would
    // silently split a player's day in two.
    const board = await db.requestBoard.create({
      data: { key: `${prefix}-dateboard`, name: "Fixture", description: "" },
    });
    const definition = await db.requestDefinition.create({
      data: {
        boardId: board.id,
        slug: `${prefix}-dated`,
        title: "Dated",
        flavorText: "",
        sequencePosition: 0,
        rewardCoins: 10n,
      },
    });
    await expectConstraint(
      db.requestCompletion.create({
        data: {
          userId,
          boardId: board.id,
          requestDefinitionId: definition.id,
          completionOrdinal: 1,
          gameDate: "7 August 2026",
          rewardCoins: 10n,
          requirementsSnapshot: [],
        },
      }),
      "gameDate",
    );
    await db.requestDefinition.delete({ where: { id: definition.id } });
    await db.requestBoard.delete({ where: { id: board.id } });
  });

  it("keeps showcase positions and map coordinates in range", async () => {
    await expectConstraint(
      db.showcaseEntry.create({
        data: { userId, itemId, position: -1 },
      }),
      "ShowcaseEntry_position_nonnegative",
    );

    const region = await db.region.create({
      data: { slug: `${prefix}-rc`, name: "C", description: "", artKey: "c" },
    });
    await expectConstraint(
      db.location.create({
        data: {
          slug: `${prefix}-offmap`,
          regionId: region.id,
          name: "L",
          description: "",
          artKey: "l",
          mapX: 140,
          mapY: 50,
        },
      }),
      "Location_map_position_bounds",
    );
    await db.region.delete({ where: { id: region.id } });
  });

  it("scopes location slugs per region", async () => {
    const regionA = await db.region.create({
      data: { slug: `${prefix}-ra`, name: "A", description: "", artKey: "a" },
    });
    const regionB = await db.region.create({
      data: { slug: `${prefix}-rb`, name: "B", description: "", artKey: "b" },
    });
    await db.location.create({
      data: { slug: "shared-name", regionId: regionA.id, name: "L", description: "", artKey: "l" },
    });
    // Same slug in another region is fine…
    await db.location.create({
      data: { slug: "shared-name", regionId: regionB.id, name: "L", description: "", artKey: "l" },
    });
    // …but not twice within one region.
    await expect(
      db.location.create({
        data: { slug: "shared-name", regionId: regionA.id, name: "L2", description: "", artKey: "l" },
      }),
    ).rejects.toThrow();
    await db.region.deleteMany({ where: { id: { in: [regionA.id, regionB.id] } } });
  });
});
