/**
 * Authorization matrix: every ownership boundary in the domain layer holds
 * against a hostile caller supplying someone else's ids. Server actions
 * derive the acting userId from the session; these tests prove the domain
 * commands themselves refuse cross-user access even if handed hostile
 * input, and that probing responses do not leak resource existence.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { feedPet, FeedError } from "@/server/modules/pets/feed-pet";
import { updateProfile, ProfileError } from "@/server/modules/profiles/profile";
import { addShowcaseItem, ShowcaseError } from "@/server/modules/profiles/showcase";
import {
  cancelListing,
  createListing,
  updateListingPrice,
} from "@/server/modules/commerce/player-shops/commands/listings";
import { claimProceeds } from "@/server/modules/commerce/player-shops/commands/proceeds";
import { EconomyError } from "@/server/modules/commerce/errors";
import {
  adminGrantCoins,
  setItemLifecycle,
} from "@/server/modules/admin/operations";
import { grantItem } from "@/server/modules/items/ownership";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems, giveStack } from "@test/factories/items";

const prefix = fixturePrefix("authz");

async function expectCode(
  promise: Promise<unknown>,
  errorClass: abstract new (...args: never[]) => Error,
  field: string,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(errorClass);
  expect((error as unknown as Record<string, unknown>)[field]).toBe(code);
}

describe.skipIf(!testDb)("authorization matrix (integration)", () => {
  const db = testDb as PrismaClient;
  let victimId: string;
  let attackerId: string;
  let foodId: string;
  let victimPetId: string;
  let victimInstanceId: string;
  let victimListingId: string;

  beforeAll(async () => {
    victimId = (
      await createTestUser(db, { username: `${prefix}_victim`, coins: 5_000n })
    ).id;
    attackerId = (
      await createTestUser(db, { username: `${prefix}_attacker`, coins: 5_000n })
    ).id;

    foodId = (
      await createTestItem(db, {
        slug: `${prefix}-snack`,
        type: "FOOD",
        hungerRestore: 10,
      })
    ).id;
    // The attacker owns plenty of food — inventory is not what's tested.
    await giveStack(db, { userId: attackerId, itemId: foodId, quantity: 10 });
    await giveStack(db, { userId: victimId, itemId: foodId, quantity: 10 });

    const species = await db.petSpecies.create({
      data: {
        slug: `${prefix}-species`,
        name: "Fixture Beast",
        description: "",
        artKey: "s",
      },
    });
    victimPetId = (
      await db.pet.create({
        data: { name: "Guarded", ownerId: victimId, speciesId: species.id },
      })
    ).id;

    const relic = await createTestItem(db, {
      slug: `${prefix}-relic`,
      stackable: false,
      provenancePolicy: "FULL_HISTORY",
    });
    victimInstanceId = await db.$transaction(async (tx) => {
      const granted = await grantItem(tx, {
        userId: victimId,
        item: relic,
        quantity: 1,
        reason: "distribution",
        source: "test",
      });
      return granted.instanceIds[0] as string;
    });

    victimListingId = (
      await createListing(db, {
        userId: victimId,
        itemId: foodId,
        quantity: 2,
        unitPrice: 15n,
        idempotencyKey: randomUUID(),
      })
    ).result.listingId;
  });

  beforeEach(async () => {
    for (const id of [victimId, attackerId]) {
      await db.rateLimitWindow.deleteMany({ where: { key: { contains: id } } });
    }
  });

  afterAll(async () => {
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.petSpecies.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("pets: feeding someone else's pet fails exactly like a missing pet", async () => {
    await expectCode(
      feedPet(db, {
        userId: attackerId,
        petId: victimPetId,
        itemId: foodId,
        idempotencyKey: randomUUID(),
      }),
      FeedError,
      "code",
      "PET_NOT_FOUND",
    );
    // Indistinguishable from a fabricated id — no existence probing.
    await expectCode(
      feedPet(db, {
        userId: attackerId,
        petId: "nonexistent",
        itemId: foodId,
        idempotencyKey: randomUUID(),
      }),
      FeedError,
      "code",
      "PET_NOT_FOUND",
    );
    // The attacker's food stayed put.
    const stack = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: attackerId, itemId: foodId } },
    });
    expect(stack.quantity).toBe(10);
  });

  it("profiles: featuring someone else's pet is rejected", async () => {
    await expectCode(
      updateProfile(db, {
        userId: attackerId,
        bio: "",
        title: "",
        featuredPetId: victimPetId,
      }),
      ProfileError,
      "code",
      "PET_NOT_OWNED",
    );
  });

  it("showcases: someone else's instance cannot be displayed", async () => {
    const relic = await db.itemInstance.findUniqueOrThrow({
      where: { id: victimInstanceId },
    });
    await expectCode(
      addShowcaseItem(db, {
        userId: attackerId,
        itemId: relic.itemId,
        itemInstanceId: victimInstanceId,
      }),
      ShowcaseError,
      "code",
      "ITEM_NOT_OWNED",
    );
  });

  it("listings: price updates and cancellation are seller-only", async () => {
    await expectCode(
      updateListingPrice(db, {
        userId: attackerId,
        listingId: victimListingId,
        unitPrice: 1n,
        idempotencyKey: randomUUID(),
      }),
      EconomyError,
      "economyCode",
      "LISTING_NOT_FOUND",
    );
    await expectCode(
      cancelListing(db, {
        userId: attackerId,
        listingId: victimListingId,
        idempotencyKey: randomUUID(),
      }),
      EconomyError,
      "economyCode",
      "LISTING_NOT_ACTIVE",
    );
    const listing = await db.playerShopListing.findUniqueOrThrow({
      where: { id: victimListingId },
    });
    expect(listing.status).toBe("ACTIVE");
    expect(listing.unitPrice).toBe(15n);
  });

  it("listings: someone else's instance cannot be listed", async () => {
    const relic = await db.itemInstance.findUniqueOrThrow({
      where: { id: victimInstanceId },
    });
    await expectCode(
      createListing(db, {
        userId: attackerId,
        itemId: relic.itemId,
        itemInstanceId: victimInstanceId,
        quantity: 1,
        unitPrice: 5n,
        idempotencyKey: randomUUID(),
      }),
      EconomyError,
      "economyCode",
      "INSTANCE_NOT_OWNED",
    );
    const untouched = await db.itemInstance.findUniqueOrThrow({
      where: { id: victimInstanceId },
    });
    expect(untouched.ownerId).toBe(victimId);
    expect(untouched.status).toBe("OWNED");
  });

  it("proceeds: claims only ever touch the caller's own till", async () => {
    const shopBefore = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: victimId },
    });
    // There is no parameter through which another till could be named: the
    // attacker's claim resolves to their own (empty) shop and finds nothing.
    await expectCode(
      claimProceeds(db, { userId: attackerId, idempotencyKey: randomUUID() }),
      EconomyError,
      "economyCode",
      "NOTHING_TO_CLAIM",
    );
    const shopAfter = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: victimId },
    });
    expect(shopAfter.unclaimedProceeds).toBe(shopBefore.unclaimedProceeds);
  });

  it("admin operations: role-gated for ordinary users, allowed for admins", async () => {
    await expectCode(
      setItemLifecycle(db, attackerId, {
        slug: `${prefix}-snack`,
        lifecycle: "DISABLED",
      }),
      EconomyError,
      "economyCode",
      "NOT_AUTHORIZED",
    );
    await expectCode(
      adminGrantCoins(db, attackerId, {
        username: `${prefix}_attacker`,
        amount: 1_000_000n,
      }),
      EconomyError,
      "economyCode",
      "NOT_AUTHORIZED",
    );
    const untouched = await db.item.findUniqueOrThrow({
      where: { slug: `${prefix}-snack` },
    });
    expect(untouched.lifecycle).toBe("ACTIVE");

    const admin = await createTestUser(db, {
      username: `${prefix}_admin`,
      isAdmin: true,
    });
    await setItemLifecycle(db, admin.id, {
      slug: `${prefix}-snack`,
      lifecycle: "RETIRED",
    });
    const changed = await db.item.findUniqueOrThrow({
      where: { slug: `${prefix}-snack` },
    });
    expect(changed.lifecycle).toBe("RETIRED");
    await setItemLifecycle(db, admin.id, {
      slug: `${prefix}-snack`,
      lifecycle: "ACTIVE",
    });
  });
});
