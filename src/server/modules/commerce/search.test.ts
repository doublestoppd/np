/**
 * Integration tests for market search. The market advertises purchases, so
 * its read predicate has to agree with what the purchase command will
 * actually allow — an item on this page that cannot be bought is a lie the
 * page tells. Pagination is arithmetic over that result set, so it is
 * covered here too.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient, User } from "@prisma/client";
import { searchItems } from "./search";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";

const prefix = fixturePrefix("mkt");

describe.skipIf(!testDb)("market search (integration)", () => {
  const db = testDb as PrismaClient;
  let seller: User;
  let shopId: string;
  let listedId: string;
  let unlistedId: string;

  /** Lists one unit of an item in the seller's shop. */
  async function list(
    itemId: string,
    overrides: { status?: "ACTIVE" | "SOLD" | "CANCELLED" } = {},
  ) {
    return db.playerShopListing.create({
      data: {
        shopId,
        sellerId: seller.id,
        itemId,
        quantity: 1,
        quantityListed: 1,
        unitPrice: 10n,
        status: overrides.status ?? "ACTIVE",
      },
    });
  }

  beforeAll(async () => {
    seller = await createTestUser(db, { username: `${prefix}_seller` });
    const shop = await db.playerShop.create({
      data: {
        ownerId: seller.id,
        slug: `${prefix}-shop`,
        name: "Fixture Stall",
        description: "Test fixture",
        listingCapacity: 20,
        active: true,
      },
    });
    shopId = shop.id;

    // Names are prefixed so ordering within the suite is deterministic.
    listedId = (
      await createTestItem(db, { slug: `${prefix}-a`, name: `${prefix} alpha` })
    ).id;
    unlistedId = (
      await createTestItem(db, { slug: `${prefix}-b`, name: `${prefix} bravo` })
    ).id;
    await list(listedId);
  });

  afterAll(async () => {
    if (!testDb) return;
    await db.playerShopListing.deleteMany({ where: { shopId } });
    await db.playerShop.deleteMany({ where: { id: shopId } });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  async function search(overrides: Partial<Parameters<typeof searchItems>[1]> = {}) {
    return searchItems(db, {
      q: prefix,
      page: 1,
      perPage: 25,
      ...overrides,
    });
  }

  it("shows only items a player can actually buy right now", async () => {
    const results = await search();
    const ids = results.items.map((item) => item.id);
    expect(ids).toContain(listedId);
    expect(ids).not.toContain(unlistedId);
  });

  it("drops an item as soon as its last listing stops being purchasable", async () => {
    const extra = await createTestItem(db, {
      slug: `${prefix}-c`,
      name: `${prefix} charlie`,
    });
    const listing = await list(extra.id);
    expect((await search()).items.map((i) => i.id)).toContain(extra.id);

    // Sold out: the row still exists, but nothing is for sale.
    await db.playerShopListing.update({
      where: { id: listing.id },
      data: { status: "SOLD" },
    });
    expect((await search()).items.map((i) => i.id)).not.toContain(extra.id);

    // Closing the shop hides it just as effectively as unlisting.
    await db.playerShopListing.update({
      where: { id: listing.id },
      data: { status: "ACTIVE" },
    });
    await db.playerShop.update({ where: { id: shopId }, data: { active: false } });
    expect((await search()).items.map((i) => i.id)).not.toContain(extra.id);
    await db.playerShop.update({ where: { id: shopId }, data: { active: true } });

    // A seller barred from commerce takes their listings off the market.
    await db.user.update({
      where: { id: seller.id },
      data: { commerceDisabledAt: new Date() },
    });
    expect((await search()).items.map((i) => i.id)).not.toContain(extra.id);
    await db.user.update({
      where: { id: seller.id },
      data: { commerceDisabledAt: null },
    });

    await db.playerShopListing.delete({ where: { id: listing.id } });
    await db.item.delete({ where: { id: extra.id } });
  });

  it("counts only purchasable listings for the 'for sale' figure", async () => {
    const cancelled = await list(listedId, { status: "CANCELLED" });
    const results = await search();
    const found = results.items.find((item) => item.id === listedId);
    expect(found?._count.playerListings).toBe(1);
    await db.playerShopListing.delete({ where: { id: cancelled.id } });
  });

  it("pages without dropping or repeating a row", async () => {
    const extras = [];
    for (const letter of ["d", "e", "f", "g"]) {
      const item = await createTestItem(db, {
        slug: `${prefix}-${letter}`,
        name: `${prefix} ${letter}`,
      });
      extras.push(item);
      await list(item.id);
    }

    const first = await search({ perPage: 2, page: 1 });
    expect(first.total).toBe(5); // alpha + four extras; bravo is unlisted
    expect(first.pageCount).toBe(3);
    expect(first.items).toHaveLength(2);

    const second = await search({ perPage: 2, page: 2 });
    const third = await search({ perPage: 2, page: 3 });
    expect(third.items).toHaveLength(1);

    const seen = [...first.items, ...second.items, ...third.items].map((i) => i.id);
    expect(new Set(seen).size).toBe(5);

    // A page number past the end lands on the last real page rather than
    // an empty one that reads as "nothing matches".
    const overshoot = await search({ perPage: 2, page: 99 });
    expect(overshoot.page).toBe(3);
    expect(overshoot.items.map((i) => i.id)).toEqual(third.items.map((i) => i.id));

    for (const item of extras) {
      await db.playerShopListing.deleteMany({ where: { itemId: item.id } });
      await db.item.delete({ where: { id: item.id } });
    }
  });
});
