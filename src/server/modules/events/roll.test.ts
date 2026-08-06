/**
 * Integration tests for the random-event roll, against a real PostgreSQL
 * database. These cover the parts that only a database can prove: the
 * anti-duplicate guard, the cooldown claim, transactional effects,
 * concurrency, and idempotent replay.
 *
 * Probability is forced to 0 or 10000 basis points per test via the
 * documented environment override, so "did an event happen" is never left
 * to chance in a test that is about something else.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { rollRandomEvent, type RollResult } from "./roll";
import { RANDOM_EVENTS } from "./catalog";
import type { RandomEventDefinition } from "./types";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";
import { ensureTestSpecies } from "@test/factories/pets";

const prefix = fixturePrefix("evt");

/** Forces every probability roll to hit (or miss) for the duration. */
function setChance(bp: number): void {
  process.env.RANDOM_EVENT_CHANCE_BP = String(bp);
}

describe.skipIf(!testDb)("random events (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let petId: string;
  let itemId: string;

  /** Catalogs are injected per test so assertions never depend on tuning. */
  function only(event: Partial<RandomEventDefinition> & { key: string }) {
    return [
      {
        title: "Test event",
        message: "Something happened to {pet}.",
        weight: 100,
        enabled: true,
        category: "grove" as const,
        rarity: "common" as const,
        effects: [{ kind: "flavor" as const }],
        ...event,
      },
    ];
  }

  async function roll(
    overrides: {
      routePath?: string;
      idempotencyKey?: string;
      now?: Date;
      catalog?: RandomEventDefinition[];
    } = {},
  ): Promise<RollResult> {
    return rollRandomEvent(db, {
      userId,
      routePath: overrides.routePath ?? "/inventory",
      idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
      now: overrides.now,
      ...(overrides.catalog ? { catalog: overrides.catalog } : {}),
    });
  }

  /** Clears pacing so each test starts from a clean, rollable state. */
  async function resetPacing(): Promise<void> {
    await db.randomEventState.deleteMany({ where: { userId } });
    await db.rateLimitWindow.deleteMany({
      where: { key: { contains: userId } },
    });
  }

  beforeEach(async () => {
    setChance(10_000);
    const user = await createTestUser(db, { username: `${prefix}_${randomUUID().slice(0, 6)}` });
    userId = user.id;
    // Backdate so minAccountAgeHours rules never accidentally gate a test.
    await db.user.update({
      where: { id: userId },
      data: { createdAt: new Date(Date.now() - 30 * 86_400_000) },
    });
    const species = await ensureTestSpecies(db, `${prefix}-species`);
    petId = (
      await db.pet.create({
        data: {
          name: "Testling",
          ownerId: userId,
          speciesId: species.id,
          hunger: 50,
          happiness: 50,
          energy: 50,
          health: 90,
          statsUpdatedAt: new Date(),
        },
      })
    ).id;
    itemId = (await createTestItem(db, { slug: `${prefix}-prize-${randomUUID().slice(0, 6)}` })).id;
  });

  afterEach(() => {
    delete process.env.RANDOM_EVENT_CHANCE_BP;
    delete process.env.RANDOM_EVENTS_ENABLED;
  });

  afterAll(async () => {
    if (!testDb) return;
    await db.randomEventOccurrence.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await db.randomEventState.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.petSpecies.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  // ---- Eligibility ----------------------------------------------------

  it("does not roll on ineligible routes", async () => {
    for (const routePath of ["/sign-in", "/api/internal/restock", "/starter", "/_next/static/x.js"]) {
      const result = await roll({ routePath });
      expect(result, routePath).toEqual({
        outcome: "none",
        reason: "ineligible-route",
      });
    }
    // Nothing was even recorded as an attempt.
    expect(await db.randomEventState.findUnique({ where: { userId } })).toBeNull();
    expect(await db.randomEventOccurrence.count({ where: { userId } })).toBe(0);
  });

  it("does not roll when the system is switched off", async () => {
    process.env.RANDOM_EVENTS_ENABLED = "false";
    expect(await roll()).toEqual({ outcome: "none", reason: "disabled" });
    expect(await db.randomEventOccurrence.count({ where: { userId } })).toBe(0);
  });

  // ---- Pacing ---------------------------------------------------------

  it("suppresses a second roll inside the anti-duplicate interval", async () => {
    setChance(0); // isolate the interval from the probability roll
    const now = new Date();
    expect((await roll({ now })).outcome).toBe("none");

    const immediate = await roll({ now: new Date(now.getTime() + 500) });
    expect(immediate).toEqual({ outcome: "none", reason: "duplicate" });

    // Past the window, attempts resume.
    const later = await roll({ now: new Date(now.getTime() + 10_000) });
    expect(later).toEqual({ outcome: "none", reason: "missed" });
  });

  it("suppresses events during the cooldown without rolling the dice", async () => {
    const now = new Date();
    const first = await roll({ now, catalog: only({ key: "first" }) });
    expect(first.outcome).toBe("event");

    const state = await db.randomEventState.findUniqueOrThrow({ where: { userId } });
    expect(state.cooldownUntil.getTime()).toBeGreaterThan(now.getTime());

    // Chance is still 100%, so only the cooldown can be suppressing this.
    const during = await roll({ now: new Date(now.getTime() + 10_000) });
    expect(during).toEqual({ outcome: "none", reason: "cooldown" });
    expect(await db.randomEventOccurrence.count({ where: { userId } })).toBe(1);

    // Past the cooldown, events resume.
    const after = await roll({
      now: new Date(state.cooldownUntil.getTime() + 10_000),
      catalog: only({ key: "second" }),
    });
    expect(after.outcome).toBe("event");
  });

  it("records nothing when the probability roll fails", async () => {
    setChance(0);
    const result = await roll();
    expect(result).toEqual({ outcome: "none", reason: "missed" });
    expect(await db.randomEventOccurrence.count({ where: { userId } })).toBe(0);
    // The attempt itself is still recorded — that is the duplicate guard.
    const state = await db.randomEventState.findUniqueOrThrow({ where: { userId } });
    expect(state.lastEventAt).toBeNull();
    expect(state.cooldownUntil.getTime()).toBe(0);
  });

  // ---- Effects --------------------------------------------------------

  it("applies a coin reward exactly once, with a ledger row", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const result = await roll({
      catalog: only({ key: "coins", effects: [{ kind: "coins", min: 7, max: 7 }] }),
    });
    expect(result.outcome).toBe("event");

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins + 7n);

    const ledger = await db.transaction.findMany({
      where: { userId, type: "RANDOM_EVENT" },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.coinsDelta).toBe(7n);

    const occurrence = await db.randomEventOccurrence.findFirstOrThrow({
      where: { userId },
    });
    expect(occurrence.coinsAwarded).toBe(7n);
    expect(occurrence.transactionId).toBe(ledger[0]?.id);
  });

  it("applies an item reward exactly once, through the ownership boundary", async () => {
    const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
    const result = await roll({
      catalog: only({
        key: "item",
        effects: [{ kind: "item", slug: item.slug, quantity: 2 }],
      }),
    });
    expect(result.outcome).toBe("event");

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId } },
    });
    expect(entry.quantity).toBe(2);
    expect(
      await db.transaction.count({ where: { userId, type: "RANDOM_EVENT" } }),
    ).toBe(1);
  });

  it("refuses to grant an item the lifecycle no longer allows", async () => {
    const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
    await db.item.update({ where: { id: itemId }, data: { lifecycle: "DISABLED" } });

    const result = await roll({
      catalog: only({ key: "killed", effects: [{ kind: "item", slug: item.slug }] }),
    });
    // The effect failure rolls the whole event back — no occurrence, no
    // reward, no half-applied state.
    expect(result.outcome).toBe("none");
    expect(await db.randomEventOccurrence.count({ where: { userId } })).toBe(0);
    expect(
      await db.inventoryEntry.findUnique({
        where: { userId_itemId: { userId, itemId } },
      }),
    ).toBeNull();
    await db.item.update({ where: { id: itemId }, data: { lifecycle: "ACTIVE" } });
  });

  it("degrades to no event when an effect references a missing item", async () => {
    // Content validation catches this offline; this asserts the runtime
    // failure mode is a quiet non-event plus telemetry, not a broken page.
    const result = await roll({
      catalog: only({
        key: "typo",
        effects: [{ kind: "item", slug: "no-such-item-anywhere" }],
      }),
    });
    expect(result.outcome).toBe("none");
    expect(await db.randomEventOccurrence.count({ where: { userId } })).toBe(0);
    expect(
      await db.transaction.count({ where: { userId, type: "RANDOM_EVENT" } }),
    ).toBe(0);
  });

  it("applies a pet stat change exactly once, clamped", async () => {
    const result = await roll({
      catalog: only({
        key: "pet",
        eligibility: { requiresPet: true },
        effects: [{ kind: "petStat", stat: "happiness", delta: 10 }],
      }),
    });
    expect(result.outcome).toBe("event");
    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.happiness).toBe(60);
    // A stat nudge is not economic: no ledger row for it.
    expect(
      await db.transaction.count({ where: { userId, type: "RANDOM_EVENT" } }),
    ).toBe(0);
  });

  it("never pushes a stat past its ceiling", async () => {
    await db.pet.update({
      where: { id: petId },
      data: { happiness: 98, statsUpdatedAt: new Date() },
    });
    await roll({
      catalog: only({
        key: "pet-clamp",
        eligibility: { requiresPet: true },
        effects: [{ kind: "petStat", stat: "happiness", delta: 25 }],
      }),
    });
    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.happiness).toBe(100);
  });

  it("records a flavour-only event without touching the economy", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const result = await roll({ catalog: only({ key: "flavor-only" }) });
    expect(result.outcome).toBe("event");

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins);
    expect(
      await db.transaction.count({ where: { userId, type: "RANDOM_EVENT" } }),
    ).toBe(0);
    expect(await db.inventoryEntry.count({ where: { userId } })).toBe(0);

    const occurrence = await db.randomEventOccurrence.findFirstOrThrow({
      where: { userId },
    });
    expect(occurrence.coinsAwarded).toBe(0n);
    expect(occurrence.transactionId).toBeNull();
  });

  // ---- Concurrency and retries ----------------------------------------

  it("cannot produce two events from concurrent requests", async () => {
    const now = new Date();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        roll({ now, catalog: only({ key: "concurrent", effects: [{ kind: "coins", min: 5, max: 5 }] }) }),
      ),
    );

    const events = results.filter((r) => r.outcome === "event");
    expect(events).toHaveLength(1);
    expect(await db.randomEventOccurrence.count({ where: { userId } })).toBe(1);
    expect(
      await db.transaction.count({ where: { userId, type: "RANDOM_EVENT" } }),
    ).toBe(1);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.coins).toBe(200n + 5n);
  });

  it("replays a retried request instead of rolling or paying again", async () => {
    const key = randomUUID();
    const catalog = only({
      key: "retry",
      effects: [{ kind: "coins", min: 9, max: 9 }],
    });
    const first = await roll({ idempotencyKey: key, catalog });
    expect(first.outcome).toBe("event");

    // Same key, well outside the anti-duplicate window: only idempotency
    // can be preventing a second payout here.
    const retry = await roll({
      idempotencyKey: key,
      catalog,
      now: new Date(Date.now() + 120_000),
    });
    expect(retry).toEqual(first);
    expect(await db.randomEventOccurrence.count({ where: { userId } })).toBe(1);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.coins).toBe(200n + 9n);
  });

  // ---- Durability of history ------------------------------------------

  it("keeps a stored occurrence unchanged when its definition changes", async () => {
    const catalog = only({
      key: "will-be-retuned",
      title: "Original title",
      message: "Original message about {pet}.",
      rarity: "rare",
    });
    const result = await roll({ catalog });
    expect(result.outcome).toBe("event");

    // Simulate the definition being rewritten in a later release.
    catalog[0]!.title = "Completely different";
    catalog[0]!.message = "Rewritten copy.";
    catalog[0]!.rarity = "common";
    catalog[0]!.enabled = false;

    const stored = await db.randomEventOccurrence.findFirstOrThrow({
      where: { userId },
    });
    expect(stored.title).toBe("Original title");
    expect(stored.message).toBe("Original message about Testling.");
    expect((stored.payload as { rarity: string }).rarity).toBe("rare");
  });

  it("resolves message placeholders against the real companion", async () => {
    await roll({ catalog: only({ key: "placeholder" }) });
    const stored = await db.randomEventOccurrence.findFirstOrThrow({
      where: { userId },
    });
    expect(stored.message).toBe("Something happened to Testling.");
    expect(stored.message).not.toContain("{pet}");
  });

  it("stores the route the event happened on", async () => {
    await roll({ routePath: "/market?q=acorn", catalog: only({ key: "routed" }) });
    const stored = await db.randomEventOccurrence.findFirstOrThrow({
      where: { userId },
    });
    expect(stored.routePath).toBe("/market");
  });

  // ---- Catalog safety --------------------------------------------------

  it("returns no event when the eligible pool is empty", async () => {
    const result = await roll({
      catalog: only({ key: "gated", eligibility: { minAccountAgeHours: 100_000 } }),
    });
    expect(result).toEqual({ outcome: "none", reason: "empty-pool" });
    expect(await db.randomEventOccurrence.count({ where: { userId } })).toBe(0);
  });

  it("never selects a disabled event from the shipped catalog", async () => {
    const disabled = new Set(
      RANDOM_EVENTS.filter((event) => !event.enabled).map((event) => event.key),
    );
    for (let i = 0; i < 25; i += 1) {
      await resetPacing();
      const result = await roll({ routePath: "/inventory" });
      if (result.outcome === "event") {
        expect(disabled.has(result.payload.eventKey)).toBe(false);
        expect(
          RANDOM_EVENTS.some((e) => e.key === result.payload.eventKey),
        ).toBe(true);
      }
    }
  });
});
