/**
 * "Where to find it" — the query behind the item page section that closes
 * the dead end a playtest walked into.
 *
 * Two properties matter enough to pin down. It must NAME places, so a
 * player told to bring two of something can find out where they live. And
 * it must publish no probability, ever: the weights are right there in
 * every row it reads, and a helpful "40% chance" would quietly undo the
 * disclosure line ADR-48 draws for the chits and the drums.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { itemSources } from "./sources";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestItem, cleanupTestItems } from "@test/factories/items";

const prefix = fixturePrefix("sources");

/**
 * The row on the item page renders as "<name> <detail>", so every clause
 * has to be a predicate of the PLACE. Written about the item instead it
 * reads as nonsense, and it did: "turns up here" rendered as "Along the
 * Wrackline turns up here", which makes the spot the thing that turns up
 * and points "here" at a location that is on the next line.
 *
 * Read out of the source rather than out of a fixture, so this covers
 * every clause in the file and not only the two a test happens to build.
 */
describe("the clause each source is described by", () => {
  const details = [
    ...readFileSync(
      join(process.cwd(), "src/server/modules/items/sources.ts"),
      "utf8",
    ).matchAll(/^\s*detail: "([^"]+)",$/gm),
  ].map((match) => match[1] as string);

  it("finds them all", () => {
    // A refactor that empties this would make the guard pass by asking
    // nothing of anybody.
    expect(details.length).toBeGreaterThanOrEqual(7);
  });

  it("never points at a place the sentence does not contain", () => {
    // "here" and "there" have nothing to refer to: the row is a fragment,
    // not a page about a location, and the place is a separate line.
    for (const detail of details) {
      expect(detail, detail).not.toMatch(/\b(here|there)\b/);
    }
  });

  it("reads as something the place does, not something the item does", () => {
    // Not a grammar checker — a check that the clause opens with a verb
    // taking the place as its subject. Add a verb to the list when a new
    // kind of source needs one; do not add a noun phrase, because a noun
    // phrase is the shape that only works with the item as the subject.
    for (const detail of details) {
      expect(detail, detail).toMatch(
        /^(is|has|stocks|turns|gives|hands|sells|yields)\b/,
      );
    }
  });
});

describe.skipIf(!testDb)("itemSources (integration)", () => {
  const db = testDb as PrismaClient;
  let itemId: string;
  let regionId: string;
  let locationId: string;
  let suffix: string;

  beforeEach(async () => {
    suffix = randomUUID().slice(0, 8);
    itemId = (await createTestItem(db, { slug: `${prefix}-thing-${suffix}` })).id;
    const region = await db.region.create({
      data: {
        slug: `${prefix}-region-${suffix}`,
        name: "Test Region",
        description: "",
        artKey: "x",
        published: true,
      },
    });
    regionId = region.id;
    const location = await db.location.create({
      data: {
        slug: `${prefix}-place-${suffix}`,
        regionId,
        name: "The Test Place",
        description: "",
        artKey: "x",
        published: true,
      },
    });
    locationId = location.id;
  });

  afterAll(async () => {
    await db.npcShopPoolEntry.deleteMany({
      where: { shop: { slug: { startsWith: prefix } } },
    });
    await db.npcShop.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.forageSpotEntry.deleteMany({
      where: { spot: { slug: { startsWith: prefix } } },
    });
    await db.forageSpot.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.location.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.region.deleteMany({ where: { slug: { startsWith: prefix } } });
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  async function stockAShop({ active = true, published = true } = {}) {
    if (!published) {
      await db.location.update({ where: { id: locationId }, data: { published: false } });
    }
    const shop = await db.npcShop.create({
      data: {
        locationId,
        slug: `${prefix}-shop-${suffix}`,
        name: "The Test Counter",
        description: "",
      },
    });
    await db.npcShopPoolEntry.create({
      data: {
        shopId: shop.id,
        itemId,
        shopRarity: "COMMON",
        price: 10n,
        weight: 50,
        minQuantity: 1,
        maxQuantity: 2,
        active,
      },
    });
  }

  it("names the shop that stocks it, and where the shop is", async () => {
    await stockAShop();
    const sources = await itemSources(db, { itemId });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      kind: "Shop",
      name: "The Test Counter",
      locationName: "The Test Place",
      href: `/explore/${prefix}-region-${suffix}/${prefix}-place-${suffix}`,
    });
  });

  it("names a forage spot the same way", async () => {
    const spot = await db.forageSpot.create({
      data: {
        slug: `${prefix}-spot-${suffix}`,
        locationId,
        name: "Under the Test Fern",
        description: "",
      },
    });
    await db.forageSpotEntry.create({
      data: { spotId: spot.id, itemId, selectionWeight: 30 },
    });
    const sources = await itemSources(db, { itemId });
    expect(sources.map((s) => s.kind)).toEqual(["Foraging"]);
    expect(sources[0]!.name).toBe("Under the Test Fern");
  });

  /**
   * The whole point of the guard. Every row this query reads carries a
   * weight; none of them may reach the page.
   */
  it("never publishes a weight, a percentage, or an odds figure", async () => {
    await stockAShop();
    const spot = await db.forageSpot.create({
      data: {
        slug: `${prefix}-spot2-${suffix}`,
        locationId,
        name: "The Test Bank",
        description: "",
      },
    });
    await db.forageSpotEntry.create({
      data: { spotId: spot.id, itemId, selectionWeight: 37 },
    });

    const serialized = JSON.stringify(await itemSources(db, { itemId }));
    expect(serialized).not.toContain("37");
    expect(serialized).not.toContain("50");
    expect(serialized).not.toMatch(/weight/i);
    expect(serialized).not.toContain("%");
    expect(serialized).not.toMatch(/chance|odds|likel/i);
  });

  it("says nothing about a place that is not published yet", async () => {
    await stockAShop({ published: false });
    expect(await itemSources(db, { itemId })).toEqual([]);
  });

  it("says nothing about a pool entry that has been switched off", async () => {
    await stockAShop({ active: false });
    expect(await itemSources(db, { itemId })).toEqual([]);
  });

  it("returns nothing at all for an item with no source, rather than throwing", async () => {
    expect(await itemSources(db, { itemId })).toEqual([]);
  });
});
