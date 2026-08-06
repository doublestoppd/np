/**
 * Architecture tests for the location activity boundary. These are the
 * guards that keep the location page generic as new activities are added.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  locationActivityRegistry,
  REGISTERED_ACTIVITY_TYPES,
} from "./registry";

const LOCATION_ROUTE = "src/app/(game)/explore/[regionSlug]/[locationSlug]/page.tsx";

/**
 * The schema enum is the source of truth for the activity set. Read from
 * the Prisma schema rather than the generated client so the test fails if
 * someone adds a type without registering a renderer, even before
 * `prisma generate` runs.
 */
function schemaActivityTypes(): string[] {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const match = schema.match(/enum LocationActivityType \{([^}]*)\}/);
  if (!match) {
    throw new Error("LocationActivityType enum not found in schema.prisma");
  }
  return match[1]!
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"));
}

describe("location activity registry", () => {
  it("registers a renderer for every activity type in the schema", () => {
    const declared = schemaActivityTypes().sort();
    const registered = [...REGISTERED_ACTIVITY_TYPES].sort();
    expect(registered).toEqual(declared);
  });

  it("exposes a callable renderer for each type", () => {
    for (const type of REGISTERED_ACTIVITY_TYPES) {
      expect(typeof locationActivityRegistry[type]).toBe("function");
    }
  });
});

describe("location route stays generic", () => {
  const route = readFileSync(LOCATION_ROUTE, "utf8");

  it("contains no feature-specific slug comparisons", () => {
    // The exact pattern Phase 7 removed: location.slug === WORD_LOCATION_SLUG
    expect(route).not.toMatch(/location\.slug\s*===/);
    expect(route).not.toMatch(/_LOCATION_SLUG/);
    expect(route).not.toMatch(/dailyActivityAt/);
  });

  it("imports no activity domain modules directly", () => {
    for (const forbidden of [
      "modules/daily/word",
      "modules/daily/wheel",
      "modules/daily/food",
      "modules/commerce",
      "modules/requests",
    ]) {
      expect(route).not.toContain(forbidden);
    }
  });

  it("delegates rendering to the registry", () => {
    expect(route).toContain("renderLocationActivity");
  });
});

describe("world domain stays free of activity domains", () => {
  it("does not import commerce, daily, or requests", () => {
    const world = readFileSync("src/server/modules/world/world.ts", "utf8");
    for (const forbidden of [
      "modules/commerce",
      "modules/daily",
      "modules/requests",
      "components/",
    ]) {
      expect(world).not.toContain(forbidden);
    }
  });
});
