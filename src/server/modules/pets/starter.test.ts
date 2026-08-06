/** Starter selection: atomicity and concurrency safety via StarterClaim. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { chooseStarter, StarterError } from "./starter";
import { runConcurrently } from "@test/helpers/concurrency";
import { withFault, InjectedFault } from "@test/helpers/fault-injection";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { ensureTestSpecies } from "@test/factories/pets";

const prefix = fixturePrefix("starter");

describe.skipIf(!testDb)("chooseStarter (integration)", () => {
  const db = testDb as PrismaClient;
  let speciesSlug: string;

  beforeAll(async () => {
    speciesSlug = `${prefix}-species`;
    await ensureTestSpecies(db, speciesSlug);
    // The starter pack references seeded slugs; ensure they exist here
    // (idempotent — matches prisma/seed.ts content when already seeded).
    for (const slug of ["sunberry-cluster", "honey-oat-loaf", "bounce-burr"]) {
      await db.item.upsert({
        where: { slug },
        create: {
          slug,
          name: slug,
          description: "Starter fixture",
          artKey: slug,
          price: 10n,
        },
        update: {},
      });
    }
  });

  afterAll(async () => {
    const users = await db.user.findMany({
      where: { username: { startsWith: prefix } },
      select: { id: true },
    });
    const ids = users.map((user) => user.id);
    await db.starterClaim.deleteMany({ where: { userId: { in: ids } } });
    await db.pet.deleteMany({ where: { ownerId: { in: ids } } });
    await cleanupTestUsers(db, prefix);
    await db.petSpecies.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("creates pet, claim, and starter pack atomically", async () => {
    const user = await createTestUser(db, { username: `${prefix}_one` });
    const { petId } = await chooseStarter(db, {
      userId: user.id,
      speciesSlug,
      petName: "Sprig",
    });
    const claim = await db.starterClaim.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(claim.petId).toBe(petId);
    const inventory = await db.inventoryEntry.findMany({
      where: { userId: user.id, quantity: { gt: 0 } },
    });
    expect(inventory.length).toBeGreaterThanOrEqual(3);
  });

  it("a second request cannot create a second starter", async () => {
    const user = await createTestUser(db, { username: `${prefix}_two` });
    await chooseStarter(db, { userId: user.id, speciesSlug, petName: "One" });
    const error = await chooseStarter(db, {
      userId: user.id,
      speciesSlug,
      petName: "Two",
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(StarterError);
    expect((error as StarterError).code).toBe("ALREADY_HAS_PET");
    expect(await db.pet.count({ where: { ownerId: user.id } })).toBe(1);
  });

  it("concurrent starter requests create exactly one pet and one claim", async () => {
    const user = await createTestUser(db, { username: `${prefix}_race` });
    const { fulfilled, rejected } = await runConcurrently([
      () => chooseStarter(db, { userId: user.id, speciesSlug, petName: "A" }),
      () => chooseStarter(db, { userId: user.id, speciesSlug, petName: "B" }),
      () => chooseStarter(db, { userId: user.id, speciesSlug, petName: "C" }),
      () => chooseStarter(db, { userId: user.id, speciesSlug, petName: "D" }),
    ]);
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(3);
    expect(
      rejected.every(
        (error) =>
          error instanceof StarterError && error.code === "ALREADY_HAS_PET",
      ),
    ).toBe(true);
    expect(await db.pet.count({ where: { ownerId: user.id } })).toBe(1);
    expect(await db.starterClaim.count({ where: { userId: user.id } })).toBe(1);
  });

  it("rolls back the pet and claim when the starter-pack grant fails", async () => {
    const user = await createTestUser(db, { username: `${prefix}_fault` });
    const faulty = withFault(db, { model: "inventoryEntry", method: "upsert" });
    await expect(
      chooseStarter(faulty, { userId: user.id, speciesSlug, petName: "Ghost" }),
    ).rejects.toThrowError(InjectedFault);
    expect(await db.pet.count({ where: { ownerId: user.id } })).toBe(0);
    expect(await db.starterClaim.count({ where: { userId: user.id } })).toBe(0);
    // A clean retry then succeeds.
    await chooseStarter(db, { userId: user.id, speciesSlug, petName: "Real" });
    expect(await db.pet.count({ where: { ownerId: user.id } })).toBe(1);
  });
});
