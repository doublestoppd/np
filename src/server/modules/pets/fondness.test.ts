/**
 * A companion's tastes, end to end against a real database.
 *
 * The unit tests in ./palate.test.ts prove the rules; these prove the
 * rules reach the pet, the shelf, and nothing else. In particular they
 * pin the shapes: the palate must never appear in a view model, and the
 * shelf must have nowhere to put a total.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { feedPet } from "./feed-pet";
import { playWithPet } from "./play-with-pet";
import { getFondness, getPublicFondness } from "./queries";
import { palateFor, PALATE_FOOD_TAGS, PALATE_TOY_TAGS } from "./palate";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { ensureTestSpecies } from "@test/factories/pets";

const prefix = fixturePrefix("fond");

describe.skipIf(!testDb)("a companion's tastes (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let username: string;
  let petId: string;
  let seed: string;

  /** Creates a pet whose palate is known, so a delight can be aimed at it. */
  async function makePet(withSeed: string) {
    const species = await ensureTestSpecies(db, `${prefix}-species`);
    const pet = await db.pet.create({
      data: {
        name: "Fixture",
        ownerId: userId,
        speciesId: species.id,
        palateSeed: withSeed,
        hunger: 40,
        happiness: 40,
        energy: 80,
        health: 100,
      },
    });
    return pet.id;
  }

  async function makeItem({
    type,
    tags,
    slug,
  }: {
    type: "FOOD" | "TOY";
    tags: string[];
    slug: string;
  }) {
    const item = await db.item.create({
      data: {
        slug,
        name: slug,
        description: "Test fixture",
        type,
        artKey: slug,
        price: 10n,
        hungerRestore: type === "FOOD" ? 10 : null,
        happinessBoost: type === "TOY" ? 20 : null,
        tags: {
          connectOrCreate: tags.map((tag) => ({
            where: { slug: tag },
            create: { slug: tag, name: tag },
          })),
        },
      },
    });
    await db.inventoryEntry.create({
      data: { userId, itemId: item.id, quantity: 5 },
    });
    return item;
  }

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 10);
    username = `${prefix}_${suffix}`;
    const user = await db.user.create({
      data: {
        username,
        normalizedUsername: username,
        passwordHash: "x",
      },
    });
    userId = user.id;
    seed = `seed-${suffix}`;
    petId = await makePet(seed);
  });

  afterAll(async () => {
    await db.petDelight.deleteMany({
      where: { pet: { owner: { username: { startsWith: prefix } } } },
    });
    await db.transaction.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await db.petToyUse.deleteMany({
      where: { pet: { owner: { username: { startsWith: prefix } } } },
    });
    await db.pet.deleteMany({
      where: { owner: { username: { startsWith: prefix } } },
    });
    await db.inventoryEntry.deleteMany({
      where: { item: { slug: { startsWith: prefix } } },
    });
    await db.item.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.user.deleteMany({ where: { username: { startsWith: prefix } } });
    await db.petSpecies.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("says nothing at all before the first discovery", async () => {
    // Not "none yet", not an empty shelf. There is no schedule here and
    // nothing is owed, so there is nothing to be behind on.
    expect(await getFondness(db, { petId })).toBeNull();
  });

  it("a meal it loves lifts its spirits; an ordinary one does not", async () => {
    const palate = palateFor(seed);
    const loved = await makeItem({
      type: "FOOD",
      tags: [palate.foodDelight],
      slug: `${prefix}-loved-${randomUUID().slice(0, 6)}`,
    });
    const plain = await makeItem({
      type: "FOOD",
      tags: ["river"],
      slug: `${prefix}-plain-${randomUUID().slice(0, 6)}`,
    });

    const before = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    const { result: ordinary } = await feedPet(db, {
      userId,
      petId,
      itemId: plain.id,
      idempotencyKey: randomUUID(),
      now: before.statsUpdatedAt,
    });
    expect(ordinary.reaction).toBe("ordinary");
    expect(ordinary.happiness).toBe(before.happiness);

    const mid = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    const { result: delight } = await feedPet(db, {
      userId,
      petId,
      itemId: loved.id,
      idempotencyKey: randomUUID(),
      now: mid.statsUpdatedAt,
    });
    expect(["delighted", "particular"]).toContain(delight.reaction);
    expect(delight.happiness).toBeGreaterThan(mid.happiness);
  });

  it("remembers what it loved, once, however often you offer it again", async () => {
    const palate = palateFor(seed);
    const loved = await makeItem({
      type: "FOOD",
      tags: [palate.foodDelight],
      slug: `${prefix}-again-${randomUUID().slice(0, 6)}`,
    });
    for (let i = 0; i < 3; i++) {
      const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
      await feedPet(db, {
        userId,
        petId,
        itemId: loved.id,
        idempotencyKey: randomUUID(),
        now: pet.statsUpdatedAt,
      });
    }
    const rows = await db.petDelight.findMany({ where: { petId } });
    expect(rows).toHaveLength(1);
    const shelf = await getFondness(db, { petId });
    expect(shelf?.items.map((entry) => entry.slug)).toEqual([loved.slug]);
  });

  it("does not double-record when two helpings land at once", async () => {
    const palate = palateFor(seed);
    const loved = await makeItem({
      type: "FOOD",
      tags: [palate.foodDelight],
      slug: `${prefix}-race-${randomUUID().slice(0, 6)}`,
    });
    await runConcurrently(
      Array.from(
        { length: 4 },
        () => () =>
          feedPet(db, {
            userId,
            petId,
            itemId: loved.id,
            idempotencyKey: randomUUID(),
          }),
      ),
    );
    expect(await db.petDelight.count({ where: { petId } })).toBe(1);
  });

  it("a toy it loves is worth more; one it ignores is worth exactly the same", async () => {
    const palate = palateFor(seed);
    const loved = await makeItem({
      type: "TOY",
      tags: [palate.toyDelight],
      slug: `${prefix}-toy-${randomUUID().slice(0, 6)}`,
    });
    const ignored = await makeItem({
      type: "TOY",
      tags: [palate.indifference],
      slug: `${prefix}-meh-${randomUUID().slice(0, 6)}`,
    });

    const start = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    const { result: meh } = await playWithPet(db, {
      userId,
      petId,
      itemId: ignored.id,
      idempotencyKey: randomUUID(),
      now: start.statsUpdatedAt,
    });
    // An indifference must cost the player nothing they paid for: the toy
    // is worth exactly its own boost, and only the sentence is drier.
    expect(meh.reaction).toBe("indifferent");
    expect(meh.happiness).toBe(start.happiness + 20);

    const mid = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    const { result: fun } = await playWithPet(db, {
      userId,
      petId,
      itemId: loved.id,
      idempotencyKey: randomUUID(),
      now: mid.statsUpdatedAt,
    });
    expect(fun.happiness - mid.happiness).toBeGreaterThan(20);
  });

  it("records nothing when the feeding is refused", async () => {
    const palate = palateFor(seed);
    const loved = await makeItem({
      type: "FOOD",
      tags: [palate.foodDelight],
      slug: `${prefix}-full-${randomUUID().slice(0, 6)}`,
    });
    await db.pet.update({ where: { id: petId }, data: { hunger: 100 } });
    await expect(
      feedPet(db, {
        userId,
        petId,
        itemId: loved.id,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();
    expect(await db.petDelight.count({ where: { petId } })).toBe(0);
  });

  it("shows a visitor the shelf without ever exposing the palate", async () => {
    const palate = palateFor(seed);
    const loved = await makeItem({
      type: "FOOD",
      tags: [palate.foodDelight],
      slug: `${prefix}-pub-${randomUUID().slice(0, 6)}`,
    });
    await feedPet(db, {
      userId,
      petId,
      itemId: loved.id,
      idempotencyKey: randomUUID(),
    });

    const shelf = await getPublicFondness(db, { username });
    expect(shelf?.items).toHaveLength(1);

    // The shapes are the feature. There is nowhere to put "3 of 8", and
    // nothing anywhere names the tag that caused any of this — a player
    // works the palate out by offering things, and a leaked tag turns
    // that into a lookup.
    expect(Object.keys(shelf ?? {}).sort()).toEqual(["items", "petName"]);
    expect(Object.keys(shelf?.items[0] ?? {}).sort()).toEqual([
      "artKey",
      "categorySlug",
      "firstAt",
      "name",
      "slug",
    ]);
    const serialized = JSON.stringify(shelf);
    expect(serialized).not.toContain(seed);
    for (const tag of [...PALATE_FOOD_TAGS, ...PALATE_TOY_TAGS]) {
      expect(serialized).not.toContain(`"${tag}"`);
    }
    expect(serialized).not.toMatch(/percent|total|\bof\b/i);
  });

  it("gives two companions different tastes", async () => {
    // The whole point: before this, every pet of a species was identical
    // to every other one, forever.
    const palates = new Set<string>();
    for (let i = 0; i < 40; i++) {
      palates.add(Object.values(palateFor(`${seed}-${i}`)).join("|"));
    }
    expect(palates.size).toBeGreaterThan(10);
  });
});
