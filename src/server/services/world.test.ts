/** Integration tests for published/unpublished world content. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getExploreRegions, getPublishedLocation } from "./world";
import { fixturePrefix, testDb } from "./test-db";

const prefix = fixturePrefix("world");

describe.skipIf(!testDb)("world content (integration)", () => {
  const db = testDb as PrismaClient;

  beforeAll(async () => {
    const region = await db.region.create({
      data: {
        slug: `${prefix}-meadow`,
        name: "Fixture Meadow",
        description: "Test only",
        artKey: `${prefix}-meadow`,
        sortOrder: 900,
        published: true,
      },
    });
    await db.location.createMany({
      data: [
        {
          slug: `${prefix}-pond`,
          regionId: region.id,
          name: "Fixture Pond",
          description: "Test only",
          artKey: `${prefix}-pond`,
          sortOrder: 0,
          published: true,
        },
        {
          slug: `${prefix}-hidden-cave`,
          regionId: region.id,
          name: "Hidden Cave",
          description: "Unpublished; must stay invisible.",
          artKey: `${prefix}-hidden-cave`,
          sortOrder: 1,
          published: false,
        },
      ],
    });
    const draftRegion = await db.region.create({
      data: {
        slug: `${prefix}-draft-region`,
        name: "Draft Region",
        description: "Unpublished region",
        artKey: `${prefix}-draft-region`,
        sortOrder: 901,
        published: false,
      },
    });
    await db.location.create({
      data: {
        slug: `${prefix}-draft-spot`,
        regionId: draftRegion.id,
        name: "Draft Spot",
        description: "Published location inside an unpublished region.",
        artKey: `${prefix}-draft-spot`,
        published: true,
      },
    });
  });

  afterAll(async () => {
    await db.region.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("returns published regions with only their published locations", async () => {
    const regions = await getExploreRegions(db);
    const meadow = regions.find(
      (region) => region.slug === `${prefix}-meadow`,
    );
    expect(meadow).toBeDefined();
    expect(meadow?.locations.map((location) => location.slug)).toEqual([
      `${prefix}-pond`,
    ]);
  });

  it("does not return unpublished regions", async () => {
    const regions = await getExploreRegions(db);
    expect(
      regions.some((region) => region.slug === `${prefix}-draft-region`),
    ).toBe(false);
  });

  it("loads a published location by slug with its region", async () => {
    const location = await getPublishedLocation(db, `${prefix}-pond`);
    expect(location?.name).toBe("Fixture Pond");
    expect(location?.region.name).toBe("Fixture Meadow");
  });

  it("returns null for unpublished locations", async () => {
    expect(await getPublishedLocation(db, `${prefix}-hidden-cave`)).toBeNull();
  });

  it("returns null for published locations inside unpublished regions", async () => {
    expect(await getPublishedLocation(db, `${prefix}-draft-spot`)).toBeNull();
  });

  it("returns null for unknown slugs", async () => {
    expect(await getPublishedLocation(db, `${prefix}-nowhere`)).toBeNull();
  });
});
