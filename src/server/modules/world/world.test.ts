/** Integration tests for published/unpublished world content. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  getExploreRegions,
  getPublishedLocation,
  getPublishedRegion,
} from "./world";
import { fixturePrefix, testDb } from "@test/helpers/database";

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
          mapX: 40,
          mapY: 60,
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

  it("world map returns published regions only", async () => {
    const regions = await getExploreRegions(db);
    expect(regions.some((region) => region.slug === `${prefix}-meadow`)).toBe(
      true,
    );
    expect(
      regions.some((region) => region.slug === `${prefix}-draft-region`),
    ).toBe(false);
  });

  it("region map returns only published locations", async () => {
    const region = await getPublishedRegion(db, `${prefix}-meadow`);
    expect(region).not.toBeNull();
    expect(region?.locations.map((location) => location.slug)).toEqual([
      `${prefix}-pond`,
    ]);
  });

  it("region map returns null for unpublished regions", async () => {
    expect(await getPublishedRegion(db, `${prefix}-draft-region`)).toBeNull();
  });

  it("resolves a published location by region and location slug", async () => {
    const location = await getPublishedLocation(
      db,
      `${prefix}-meadow`,
      `${prefix}-pond`,
    );
    expect(location?.name).toBe("Fixture Pond");
    expect(location?.region.name).toBe("Fixture Meadow");
  });

  it("does not resolve a location under the wrong region slug", async () => {
    expect(
      await getPublishedLocation(db, `${prefix}-draft-region`, `${prefix}-pond`),
    ).toBeNull();
  });

  it("returns null for unpublished locations", async () => {
    expect(
      await getPublishedLocation(
        db,
        `${prefix}-meadow`,
        `${prefix}-hidden-cave`,
      ),
    ).toBeNull();
  });

  it("returns null for published locations inside unpublished regions", async () => {
    expect(
      await getPublishedLocation(
        db,
        `${prefix}-draft-region`,
        `${prefix}-draft-spot`,
      ),
    ).toBeNull();
  });

  it("returns null for unknown slugs", async () => {
    expect(
      await getPublishedLocation(db, `${prefix}-meadow`, `${prefix}-nowhere`),
    ).toBeNull();
  });
});
