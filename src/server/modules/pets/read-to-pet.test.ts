/**
 * Reading aloud: the shelf, the insight, and the loop it deliberately
 * does not have (ADR-50).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ReadError, readToPet } from "./read-to-pet";
import { getReadingShelf } from "./queries";
import {
  INSIGHT_BANDS,
  insightBand,
  insightBandProgress,
  rereadInsight,
} from "@/lib/pet-insight";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";
import { ensureTestSpecies } from "@test/factories/pets";

const prefix = fixturePrefix("reading");

async function expectReadError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ReadError);
  expect((error as ReadError).readCode).toBe(code);
}

describe("insight bands (pure)", () => {
  it("opens on a band that compliments a companion nobody has read to", () => {
    const first = insightBand(0);
    expect(first).toBe(INSIGHT_BANDS[0]);
    expect(first.from).toBe(0);
    // The whole point of the naming rule: no band insults the animal.
    const names = INSIGHT_BANDS.map((band) => band.name.toLowerCase()).join(" ");
    for (const slur of ["stupid", "dim", "slow", "dull", "empty", "ignorant"]) {
      expect(names).not.toContain(slur);
    }
  });

  it("climbs monotonically and never falls back", () => {
    let previous = -1;
    for (const band of INSIGHT_BANDS) {
      expect(band.from).toBeGreaterThan(previous);
      previous = band.from;
    }
    for (const band of INSIGHT_BANDS) {
      expect(insightBand(band.from)).toBe(band);
      expect(insightBand(band.from + 1)).toBe(band);
    }
  });

  it("reads full at the top rather than crawling toward a bound", () => {
    const last = INSIGHT_BANDS[INSIGHT_BANDS.length - 1];
    expect(insightBandProgress(last?.from ?? 0)).toBe(1);
    expect(insightBandProgress(1_000_000)).toBe(1);
    expect(insightBandProgress(0)).toBe(0);
  });

  it("makes a re-read worth something, and much less than a new title", () => {
    for (const value of [6, 20, 46, 110]) {
      const again = rereadInsight(value);
      expect(again).toBeGreaterThanOrEqual(1);
      expect(again).toBeLessThan(value);
    }
    // Floored at 1: a re-read is diminished, never literally pointless.
    expect(rereadInsight(1)).toBe(1);
  });
});

describe.skipIf(!testDb)("reading to a companion (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let petId: string;
  let bookId: string;

  const read = (overrides: { key?: string; itemId?: string } = {}) =>
    readToPet(db, {
      userId,
      petId,
      itemId: overrides.itemId ?? bookId,
      idempotencyKey: overrides.key ?? randomUUID(),
    });

  async function give(n: number, itemId = bookId): Promise<void> {
    await db.inventoryEntry.upsert({
      where: { userId_itemId: { userId, itemId } },
      create: { userId, itemId, quantity: n },
      update: { quantity: n },
    });
  }

  beforeEach(async () => {
    userId = (
      await createTestUser(db, { username: `${prefix}_${randomUUID().slice(0, 8)}` })
    ).id;
    const species = await ensureTestSpecies(db, `${prefix}-species`);
    petId = (
      await db.pet.create({
        data: { name: "Fixture", ownerId: userId, speciesId: species.id },
      })
    ).id;

    if (!bookId) {
      const item = await createTestItem(db, {
        slug: `${prefix}-book`,
        type: "BOOK",
        price: 50n,
      });
      bookId = item.id;
      await db.book.create({
        data: { itemId: bookId, insight: 20, author: "A. Fixture" },
      });
    }
  });

  afterAll(async () => {
    await db.petBookReading.deleteMany({
      where: { item: { slug: { startsWith: prefix } } },
    });
    await db.book.deleteMany({
      where: { item: { slug: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("consumes the book, puts the title on the shelf, and raises insight", async () => {
    await give(2);
    const { result, replayed } = await read();

    expect(replayed).toBe(false);
    expect(result.firstTime).toBe(true);
    expect(result.insightGained).toBe(20);
    expect(result.insight).toBe(20);
    expect(result.titlesRead).toBe(1);

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: bookId } },
    });
    expect(entry.quantity).toBe(1);

    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.insight).toBe(20);

    // The reading is in the ledger as an item use, like feeding and play.
    expect(
      await db.transaction.count({ where: { userId, type: "ITEM_USE" } }),
    ).toBe(1);
  });

  /**
   * The anti-grind rule, and the design statement behind it: the shelf is
   * a list of TITLES, so breadth is what teaches. Without this, buying one
   * cheap book a hundred times would be the most coin-efficient way to
   * raise the meter.
   */
  it("gives much less for a title the companion already knows", async () => {
    await give(3);
    const first = await read();
    const again = await read();

    expect(again.result.firstTime).toBe(false);
    expect(again.result.insightGained).toBe(rereadInsight(20));
    expect(again.result.insightGained).toBeLessThan(first.result.insightGained);

    // Still one title on the shelf, read twice.
    const reading = await db.petBookReading.findUniqueOrThrow({
      where: { petId_itemId: { petId, itemId: bookId } },
    });
    expect(reading.timesRead).toBe(2);
    expect(reading.insightGiven).toBe(20 + rereadInsight(20));
    expect(again.result.titlesRead).toBe(1);
  });

  it("never pays twice for one reading on a replay", async () => {
    await give(2);
    const key = randomUUID();
    const first = await read({ key });
    const replay = await read({ key });

    expect(replay.replayed).toBe(true);
    expect(replay.result.insight).toBe(first.result.insight);

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: bookId } },
    });
    expect(entry.quantity).toBe(1);
    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.insight).toBe(20);
  });

  it("cannot be raced into reading more books than are held", async () => {
    await give(2);
    const race = await runConcurrently([
      () => read(),
      () => read(),
      () => read(),
      () => read(),
    ]);
    expect(race.fulfilled.length + race.rejected.length).toBe(4);

    const entry = await db.inventoryEntry.findUnique({
      where: { userId_itemId: { userId, itemId: bookId } },
    });
    expect(entry?.quantity ?? 0).toBe(0);

    // Whatever survived, the insight matches the readings recorded — a
    // book consumed with no insight, or insight with no book, are the two
    // states that must be unreachable.
    const reading = await db.petBookReading.findUnique({
      where: { petId_itemId: { petId, itemId: bookId } },
    });
    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.insight).toBe(reading?.insightGiven ?? 0);
    expect(pet.insight).toBeGreaterThan(0);
  });

  it("refuses when the satchel is empty, and changes nothing", async () => {
    await give(0);
    const before = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    await expectReadError(read(), "NO_ITEM_IN_INVENTORY");
    const after = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(after.insight).toBe(before.insight);
  });

  it("refuses an item that is not a book", async () => {
    const notABook = await createTestItem(db, {
      slug: `${prefix}-not-a-book-${randomUUID().slice(0, 8)}`,
    });
    await give(1, notABook.id);
    await expectReadError(read({ itemId: notABook.id }), "NOT_A_BOOK");
  });

  it("refuses to read to somebody else's companion", async () => {
    const stranger = await createTestUser(db, {
      username: `${prefix}_other_${randomUUID().slice(0, 8)}`,
    });
    const species = await ensureTestSpecies(db, `${prefix}-species`);
    const theirPet = await db.pet.create({
      data: { name: "Theirs", ownerId: stranger.id, speciesId: species.id },
    });
    await give(1);
    await expectReadError(
      readToPet(db, {
        userId,
        petId: theirPet.id,
        itemId: bookId,
        idempotencyKey: randomUUID(),
      }),
      // Reported identically to a missing pet, so ids cannot be probed.
      "PET_NOT_FOUND",
    );
  });

  it("shows the shelf without ever implying what is missing from it", async () => {
    await give(1);
    await read();
    const shelf = await getReadingShelf(db, { petId });
    expect(shelf?.titles).toHaveLength(1);
    expect(shelf?.insight).toBe(20);
    // No denominator anywhere in the view model: not a total, not a
    // percentage, not a count of what exists (docs/profile-and-showcases.md).
    const keys = Object.keys(shelf ?? {});
    expect(keys.sort()).toEqual(["insight", "petName", "titles"]);
    const serialized = JSON.stringify(shelf);
    expect(serialized).not.toContain("total");
    expect(serialized).not.toContain("percent");
  });
});
