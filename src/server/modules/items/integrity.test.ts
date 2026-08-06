/** Database-level safeguard tests (CHECK constraints, Phase 2 + Phase 3). */
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
