import { describe, expect, it } from "vitest";
import { eligibleEvents, selectEvent, type SelectionContext } from "./selection";
import { isEligibleRoute, normalizeRoutePath } from "./routes";
import { RANDOM_EVENTS } from "./catalog";
import type { RandomEventDefinition } from "./types";

/**
 * Pure-logic tests for the two halves that must stay separable: which
 * events *may* fire, and which one *does*.
 */

function event(
  overrides: Partial<RandomEventDefinition> & { key: string },
): RandomEventDefinition {
  return {
    title: "T",
    message: "M",
    weight: 100,
    enabled: true,
    category: "grove",
    rarity: "common",
    effects: [{ kind: "flavor" }],
    ...overrides,
  };
}

const BASE: SelectionContext = {
  routePath: "/",
  hasPet: true,
  accountAgeHours: 1_000,
  suppressedKeys: new Set(),
};

describe("route eligibility", () => {
  it("rolls only on game routes", () => {
    for (const path of [
      "/",
      "/explore",
      "/explore/dapplewood/old-footbridge",
      "/inventory",
      "/market",
      "/items/echo-shell",
      "/shop",
      "/history",
    ]) {
      expect(isEligibleRoute(path), path).toBe(true);
    }
  });

  it("refuses auth, onboarding, API, asset, and unknown routes", () => {
    // The allow-list default matters most here: a route nobody thought
    // about must not become an event surface by omission.
    for (const path of [
      "/sign-in",
      "/sign-up",
      "/starter",
      "/api/internal/restock",
      "/api/health",
      "/_next/static/chunk.js",
      "/favicon.ico",
      "/admin",
      "/some-future-page",
    ]) {
      expect(isEligibleRoute(path), path).toBe(false);
    }
  });

  it("excludes pages where an interrupting modal would cost work", () => {
    expect(isEligibleRoute("/profile")).toBe(true);
    expect(isEligibleRoute("/profile/edit")).toBe(false);
  });

  it("normalizes query strings, fragments, and trailing slashes", () => {
    expect(normalizeRoutePath("/market?q=acorn&page=2")).toBe("/market");
    expect(normalizeRoutePath("/inventory#top")).toBe("/inventory");
    expect(normalizeRoutePath("/explore/")).toBe("/explore");
    expect(normalizeRoutePath("/")).toBe("/");
  });

  it("rejects anything that is not a same-origin path", () => {
    for (const raw of [
      "",
      "https://example.com/market",
      "//example.com/market",
      "market",
      "\\market",
      `/${"x".repeat(600)}`,
    ]) {
      expect(normalizeRoutePath(raw), raw).toBeNull();
    }
  });

  it("only matches whole path segments, not string prefixes", () => {
    // "/shop" must not admit "/shopping-cart-exploit".
    expect(isEligibleRoute("/shopfront-nonsense")).toBe(false);
    expect(isEligibleRoute("/shop/upgrades")).toBe(true);
  });
});

describe("eligibleEvents", () => {
  it("drops disabled events and non-positive weights", () => {
    const pool = eligibleEvents(
      [
        event({ key: "on" }),
        event({ key: "off", enabled: false }),
        event({ key: "weightless", weight: 0 }),
      ],
      BASE,
    );
    expect(pool.map((e) => e.key)).toEqual(["on"]);
  });

  it("drops events still inside their own cooldown", () => {
    const pool = eligibleEvents([event({ key: "rare-thing" })], {
      ...BASE,
      suppressedKeys: new Set(["rare-thing"]),
    });
    expect(pool).toHaveLength(0);
  });

  it("honours pet, account-age, and route rules", () => {
    const catalog = [
      event({ key: "needs-pet", eligibility: { requiresPet: true } }),
      event({ key: "needs-age", eligibility: { minAccountAgeHours: 72 } }),
      event({
        key: "needs-route",
        eligibility: { routePrefixes: ["/explore/dapplewood/old-footbridge"] },
      }),
      event({ key: "always" }),
    ];

    expect(
      eligibleEvents(catalog, { ...BASE, hasPet: false }).map((e) => e.key),
    ).not.toContain("needs-pet");
    expect(
      eligibleEvents(catalog, { ...BASE, accountAgeHours: 2 }).map((e) => e.key),
    ).not.toContain("needs-age");
    expect(eligibleEvents(catalog, BASE).map((e) => e.key)).not.toContain(
      "needs-route",
    );
    expect(
      eligibleEvents(catalog, {
        ...BASE,
        routePath: "/explore/dapplewood/old-footbridge",
      }).map((e) => e.key),
    ).toContain("needs-route");
    // The unconditional event survives every one of those contexts.
    expect(eligibleEvents(catalog, { ...BASE, hasPet: false }).map((e) => e.key)).toContain(
      "always",
    );
  });
});

describe("selectEvent", () => {
  it("returns null for an empty pool instead of throwing", () => {
    // A page view must never 500 because the catalog filtered to nothing.
    expect(selectEvent([])).toBeNull();
  });

  it("returns null when every weight is invalid", () => {
    expect(
      selectEvent([
        event({ key: "a", weight: 0 }),
        event({ key: "b", weight: -5 }),
        event({ key: "c", weight: Number.NaN }),
      ]),
    ).toBeNull();
  });

  it("ignores invalid weights but still picks from the valid remainder", () => {
    const chosen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const picked = selectEvent([
        event({ key: "bad", weight: Number.POSITIVE_INFINITY }),
        event({ key: "good", weight: 10 }),
      ]);
      if (picked) chosen.add(picked.key);
    }
    expect(chosen).toEqual(new Set(["good"]));
  });

  it("respects relative weights", () => {
    const counts = { heavy: 0, light: 0 };
    for (let i = 0; i < 2_000; i += 1) {
      const picked = selectEvent([
        event({ key: "heavy", weight: 90 }),
        event({ key: "light", weight: 10 }),
      ]);
      counts[picked?.key as "heavy" | "light"] += 1;
    }
    expect(counts.heavy).toBeGreaterThan(counts.light * 3);
    expect(counts.light).toBeGreaterThan(0);
  });
});

describe("shipped catalog", () => {
  it("always leaves something selectable for a plain signed-in page view", () => {
    // The worst realistic case: a brand-new account with no companion on
    // the least specific route. If this pool is empty, the whole system
    // silently does nothing for new players.
    const pool = eligibleEvents(RANDOM_EVENTS, {
      routePath: "/",
      hasPet: false,
      accountAgeHours: 0,
      suppressedKeys: new Set(),
    });
    expect(pool.length).toBeGreaterThan(0);
    expect(selectEvent(pool)).not.toBeNull();
  });

  it("keeps the rare tail rare", () => {
    const total = RANDOM_EVENTS.filter((e) => e.enabled).reduce(
      (sum, e) => sum + e.weight,
      0,
    );
    for (const rare of RANDOM_EVENTS.filter((e) => e.rarity === "legendary")) {
      expect(rare.weight / total).toBeLessThan(0.001);
    }
  });
});
