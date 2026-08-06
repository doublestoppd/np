/** Integration tests for profile updates and the public profile read. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getPublicProfile, ProfileError, updateProfile } from "./profile";
import { addShowcaseItem } from "./showcase";
import { fixturePrefix, testDb } from "./test-db";

const prefix = fixturePrefix("prof");

describe.skipIf(!testDb)("profile (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let username: string;
  let strangerId: string;
  let ownPetId: string;
  let strangerPetId: string;
  let itemId: string;

  beforeAll(async () => {
    username = `${prefix}_user`;
    const user = await db.user.create({
      data: { username, passwordHash: "x" },
    });
    userId = user.id;
    const stranger = await db.user.create({
      data: { username: `${prefix}_stranger`, passwordHash: "x" },
    });
    strangerId = stranger.id;

    const species = await db.petSpecies.upsert({
      where: { slug: `${prefix}-species` },
      create: {
        slug: `${prefix}-species`,
        name: "Fixture Species",
        description: "Test only",
        artKey: "test",
      },
      update: {},
    });
    ownPetId = (
      await db.pet.create({
        data: { name: "Mine", ownerId: userId, speciesId: species.id },
      })
    ).id;
    strangerPetId = (
      await db.pet.create({
        data: { name: "Theirs", ownerId: strangerId, speciesId: species.id },
      })
    ).id;

    const item = await db.item.create({
      data: {
        slug: `${prefix}-treasure`,
        name: "Fixture Treasure",
        description: "Test only",
        artKey: `${prefix}-treasure`,
        price: 2,
      },
    });
    itemId = item.id;
    await db.inventoryEntry.create({
      data: { userId, itemId, quantity: 1 },
    });
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { username: { startsWith: prefix } } });
    await db.item.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.petSpecies.deleteMany({
      where: { slug: { startsWith: prefix } },
    });
    await db.$disconnect();
  });

  it("creates and updates the profile", async () => {
    await updateProfile(db, {
      userId,
      bio: "I keep pebbles.",
      title: "Pebble Keeper",
      featuredPetId: null,
    });
    const profile = await db.profile.findUniqueOrThrow({ where: { userId } });
    expect(profile.bio).toBe("I keep pebbles.");
    expect(profile.title).toBe("Pebble Keeper");

    await updateProfile(db, {
      userId,
      bio: "Updated.",
      title: "Pebble Keeper",
      featuredPetId: ownPetId,
    });
    const updated = await db.profile.findUniqueOrThrow({ where: { userId } });
    expect(updated.bio).toBe("Updated.");
    expect(updated.featuredPetId).toBe(ownPetId);
  });

  it("rejects featuring a pet the user does not own", async () => {
    const error = await updateProfile(db, {
      userId,
      bio: "",
      title: "",
      featuredPetId: strangerPetId,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ProfileError);
    expect((error as ProfileError).code).toBe("PET_NOT_OWNED");
  });

  it("returns null for unknown usernames", async () => {
    expect(await getPublicProfile(db, `${prefix}_nobody`)).toBeNull();
  });

  it("exposes only public-safe fields", async () => {
    await updateProfile(db, {
      userId,
      bio: "Hello.",
      title: "Wanderer",
      featuredPetId: ownPetId,
    });
    const profile = await getPublicProfile(db, username);
    expect(profile).not.toBeNull();
    expect(profile).toEqual({
      username,
      joinedAt: expect.any(Date),
      coins: expect.any(Number),
      title: "Wanderer",
      bio: "Hello.",
      shop: null,
      featuredPet: {
        name: "Mine",
        level: 1,
        speciesName: "Fixture Species",
        artKey: "test",
      },
      showcase: expect.any(Array),
    });
    expect(JSON.stringify(profile)).not.toContain("passwordHash");
  });

  it("falls back to the oldest pet when no featured pet is chosen", async () => {
    await updateProfile(db, {
      userId,
      bio: "",
      title: "",
      featuredPetId: null,
    });
    const profile = await getPublicProfile(db, username);
    expect(profile?.featuredPet?.name).toBe("Mine");
  });

  it("applies defaults when no profile row exists", async () => {
    const profile = await getPublicProfile(db, `${prefix}_stranger`);
    expect(profile).not.toBeNull();
    expect(profile?.bio).toBe("");
    expect(profile?.title).toBe("");
    expect(profile?.featuredPet?.name).toBe("Theirs");
  });

  it("hides showcase entries the player no longer owns", async () => {
    await addShowcaseItem(db, { userId, itemId });
    let profile = await getPublicProfile(db, username);
    expect(profile?.showcase.map((entry) => entry.name)).toEqual([
      "Fixture Treasure",
    ]);

    await db.inventoryEntry.update({
      where: { userId_itemId: { userId, itemId } },
      data: { quantity: 0 },
    });
    profile = await getPublicProfile(db, username);
    expect(profile?.showcase).toEqual([]);
  });
});
