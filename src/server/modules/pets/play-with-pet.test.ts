/**
 * Integration tests for playing with a companion — the verb happiness
 * never had. Runs against a real PostgreSQL database.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { playWithPet, PlayError } from "./play-with-pet";
import { PLAY_COOLDOWN_MINUTES, PLAY_ENERGY_COST } from "./play-config";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems, giveStack } from "@test/factories/items";
import { ensureTestSpecies } from "@test/factories/pets";

const prefix = fixturePrefix("play");

async function expectPlayError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PlayError);
  expect((error as PlayError).code).toBe(code);
}

describe.skipIf(!testDb)("playWithPet (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let otherUserId: string;
  let petId: string;
  let toyId: string;
  let otherToyId: string;
  let foodId: string;

  const play = (overrides: Partial<{ itemId: string; now: Date; key: string }> = {}) =>
    playWithPet(db, {
      userId,
      petId,
      itemId: overrides.itemId ?? toyId,
      idempotencyKey: overrides.key ?? randomUUID(),
      now: overrides.now,
    });

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    userId = (await createTestUser(db, { username: `${prefix}_${suffix}` })).id;
    otherUserId = (
      await createTestUser(db, { username: `${prefix}_o_${suffix}` })
    ).id;
    const species = await ensureTestSpecies(db, `${prefix}-species`);
    petId = (
      await db.pet.create({
        data: {
          name: "Testling",
          ownerId: userId,
          speciesId: species.id,
          hunger: 80,
          happiness: 50,
          energy: 50,
          health: 90,
          statsUpdatedAt: new Date(),
        },
      })
    ).id;
    toyId = (
      await createTestItem(db, {
        slug: `${prefix}-toy-${suffix}`,
        type: "TOY",
        happinessBoost: 15,
      })
    ).id;
    otherToyId = (
      await createTestItem(db, {
        slug: `${prefix}-toy2-${suffix}`,
        type: "TOY",
        happinessBoost: 10,
      })
    ).id;
    foodId = (
      await createTestItem(db, {
        slug: `${prefix}-food-${suffix}`,
        type: "FOOD",
        hungerRestore: 10,
      })
    ).id;
    for (const itemId of [toyId, otherToyId, foodId]) {
      await giveStack(db, { userId, itemId, quantity: 1 });
    }
  });

  afterAll(async () => {
    if (!testDb) return;
    await db.transaction.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.petSpecies.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("raises happiness, spends energy, and does NOT consume the toy", async () => {
    const { result } = await play();
    expect(result.happiness).toBe(65); // 50 + 15
    expect(result.energy).toBe(50 - PLAY_ENERGY_COST);

    // The whole point: a toy is a possession, not a snack.
    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: toyId } },
    });
    expect(entry.quantity).toBe(1);

    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.happiness).toBe(65);
  });

  it("refuses the same toy twice in a row, but not a different one", async () => {
    const now = new Date();
    await play({ now });

    await expectPlayError(
      play({ now: new Date(now.getTime() + 60_000) }),
      "TOY_RESTING",
    );

    // Variety is the limiter, not spending.
    const { result } = await play({
      itemId: otherToyId,
      now: new Date(now.getTime() + 60_000),
    });
    expect(result.happiness).toBe(75); // 65 + 10

    // And the first toy works again once its novelty returns.
    const later = new Date(now.getTime() + (PLAY_COOLDOWN_MINUTES + 1) * 60_000);
    await expect(play({ now: later })).resolves.toBeTruthy();
  });

  it("never lets energy fall below zero, and never blocks on it", async () => {
    // CLAUDE.md forbids energy gating play: an exhausted companion still
    // plays and still gains the full happiness.
    await db.pet.update({
      where: { id: petId },
      data: { energy: 1, happiness: 10, statsUpdatedAt: new Date() },
    });
    const { result } = await play();
    expect(result.energy).toBe(0);
    expect(result.happiness).toBe(25);
  });

  it("refuses a companion that could not be happier, using nothing up", async () => {
    await db.pet.update({
      where: { id: petId },
      data: { happiness: 100, statsUpdatedAt: new Date() },
    });
    await expectPlayError(play(), "PET_DELIGHTED");

    // The refusal must not burn the toy's novelty either.
    const use = await db.petToyUse.findUnique({
      where: { petId_itemId: { petId, itemId: toyId } },
    });
    expect(use).toBeNull();
  });

  it("rejects food, unowned toys, and other people's companions", async () => {
    await expectPlayError(play({ itemId: foodId }), "NOT_A_TOY");

    const unowned = await createTestItem(db, {
      slug: `${prefix}-unowned-${randomUUID().slice(0, 6)}`,
      type: "TOY",
      happinessBoost: 5,
    });
    await expectPlayError(play({ itemId: unowned.id }), "NO_ITEM_IN_INVENTORY");

    const stranger = await db.pet.create({
      data: {
        name: "Theirs",
        ownerId: otherUserId,
        speciesId: (await ensureTestSpecies(db, `${prefix}-species`)).id,
      },
    });
    await expectPlayError(
      playWithPet(db, {
        userId,
        petId: stranger.id,
        itemId: toyId,
        idempotencyKey: randomUUID(),
      }),
      // Reported as missing so pet ids cannot be probed.
      "PET_NOT_FOUND",
    );
  });

  it("replays a duplicate submission instead of playing twice", async () => {
    const key = randomUUID();
    const first = await play({ key });
    const retry = await play({ key });
    expect(retry.replayed).toBe(true);
    expect(retry.result).toEqual(first.result);

    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.happiness).toBe(65);
  });

  it("concurrent plays with one toy land exactly once", async () => {
    const now = new Date();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => play({ now })),
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    expect(succeeded).toBe(1);

    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.happiness).toBe(65);
    expect(
      await db.transaction.count({ where: { userId, type: "ITEM_USE" } }),
    ).toBe(1);
  });
});
