/**
 * Operator commands that move goods or coins. `disablePlayerListing` is the
 * one ledgered economy path that had no test at all, despite writing a
 * ledger row, flipping a status, and returning escrow — the shape
 * docs/conventions.md requires integration coverage for.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  adminGrantCoins,
  adminGrantItem,
  disablePlayerListing,
  setItemLifecycle,
} from "./operations";
import { createListing } from "@/server/modules/commerce/player-shops/commands/listings";
import { EconomyError } from "@/server/modules/commerce/errors";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems, giveStack } from "@test/factories/items";

const prefix = fixturePrefix("adminops");

describe.skipIf(!testDb)("admin operations (integration)", () => {
  const db = testDb as PrismaClient;
  let sellerId: string;
  let itemId: string;
  let itemSlug: string;

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    sellerId = (
      await createTestUser(db, {
        username: `${prefix}_s_${suffix}`,
        coins: 1_000n,
      })
    ).id;
    itemSlug = `${prefix}-good-${suffix}`;
    itemId = (await createTestItem(db, { slug: itemSlug, price: 40n })).id;
  });

  afterAll(async () => {
    await db.transaction.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await db.playerShopListing.deleteMany({
      where: { seller: { username: { startsWith: prefix } } },
    });
    await db.playerShop.deleteMany({
      where: { owner: { username: { startsWith: prefix } } },
    });
    // Audit rows from a "cli" actor carry no userId, so they are not
    // reachable from the user cleanup above.
    await db.securityEvent.deleteMany({
      where: { type: "admin-action", message: { contains: prefix } },
    });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  async function listSomething(quantity = 3) {
    await giveStack(db, { userId: sellerId, itemId, quantity: quantity + 2 });
    const { result } = await createListing(db, {
      userId: sellerId,
      itemId,
      itemInstanceId: null,
      quantity,
      unitPrice: 50n,
      idempotencyKey: randomUUID(),
    });
    return result.listingId;
  }

  describe("disablePlayerListing", () => {
    it("returns escrow to the seller and records why", async () => {
      const listingId = await listSomething(3);
      const held = await db.inventoryEntry.findUniqueOrThrow({
        where: { userId_itemId: { userId: sellerId, itemId } },
      });

      await disablePlayerListing(db, "cli", { listingId });

      const listing = await db.playerShopListing.findUniqueOrThrow({
        where: { id: listingId },
      });
      expect(listing.status).toBe("DISABLED");

      // The goods come home — all of them, exactly once.
      const after = await db.inventoryEntry.findUniqueOrThrow({
        where: { userId_itemId: { userId: sellerId, itemId } },
      });
      expect(after.quantity).toBe(held.quantity + 3);

      // And the return is in the seller's history, not only the listing's.
      const ledger = await db.transaction.findFirstOrThrow({
        where: {
          userId: sellerId,
          type: "PLAYER_LISTING_CANCEL",
          playerListingId: listingId,
        },
      });
      expect(ledger.quantity).toBe(3);
      expect(ledger.coinsDelta).toBe(0n);
      expect(ledger.note).toMatch(/administrator/i);
    });

    it("returns escrow even when the item is why it was disabled", async () => {
      // A kill-switched item must still come back: pulling something out of
      // circulation must never confiscate the copies people already own.
      const listingId = await listSomething(2);
      await setItemLifecycle(db, "cli", { slug: itemSlug, lifecycle: "DISABLED" });

      await disablePlayerListing(db, "cli", { listingId });

      const after = await db.inventoryEntry.findUniqueOrThrow({
        where: { userId_itemId: { userId: sellerId, itemId } },
      });
      expect(after.quantity).toBe(4);
    });

    it("refuses a listing that is not active, changing nothing", async () => {
      const listingId = await listSomething(1);
      await disablePlayerListing(db, "cli", { listingId });

      const before = await db.inventoryEntry.findUniqueOrThrow({
        where: { userId_itemId: { userId: sellerId, itemId } },
      });
      await expect(
        disablePlayerListing(db, "cli", { listingId }),
      ).rejects.toBeInstanceOf(EconomyError);

      const after = await db.inventoryEntry.findUniqueOrThrow({
        where: { userId_itemId: { userId: sellerId, itemId } },
      });
      expect(after.quantity).toBe(before.quantity);
      expect(
        await db.transaction.count({
          where: { type: "PLAYER_LISTING_CANCEL", playerListingId: listingId },
        }),
      ).toBe(1);
    });
  });

  describe("setItemLifecycle", () => {
    it("stamps when an item entered and left circulation", async () => {
      // These columns are the only record of when something was buyable.
      const released = new Date("2026-01-02T00:00:00Z");
      const retired = new Date("2026-06-02T00:00:00Z");
      await setItemLifecycle(db, "cli", {
        slug: itemSlug,
        lifecycle: "ACTIVE",
        now: released,
      });
      await setItemLifecycle(db, "cli", {
        slug: itemSlug,
        lifecycle: "RETIRED",
        now: retired,
      });

      const item = await db.item.findUniqueOrThrow({ where: { slug: itemSlug } });
      expect(item.lifecycle).toBe("RETIRED");
      expect(item.releasedAt).toEqual(released);
      expect(item.retiredAt).toEqual(retired);

      // Re-releasing keeps the original dates: both are a record of what
      // happened, not a description of the current state.
      await setItemLifecycle(db, "cli", {
        slug: itemSlug,
        lifecycle: "ACTIVE",
        now: new Date("2026-09-01T00:00:00Z"),
      });
      const again = await db.item.findUniqueOrThrow({ where: { slug: itemSlug } });
      expect(again.releasedAt).toEqual(released);
      expect(again.retiredAt).toEqual(retired);
    });
  });

  describe("adminGrantItem", () => {
    it("grants a kill-switched item, because an adjustment is not distribution", async () => {
      await setItemLifecycle(db, "cli", { slug: itemSlug, lifecycle: "DISABLED" });
      await adminGrantItem(db, "cli", {
        username: (
          await db.user.findUniqueOrThrow({ where: { id: sellerId } })
        ).username,
        itemSlug,
        quantity: 2,
      });
      const entry = await db.inventoryEntry.findUniqueOrThrow({
        where: { userId_itemId: { userId: sellerId, itemId } },
      });
      expect(entry.quantity).toBe(2);
    });
  });

  /**
   * The debug screen's grant button runs through here, and that screen
   * shows a reconciliation report a few lines above the button. A grant
   * that credited the wallet without its ledger row would light up the
   * invariant on the very next render, so the pairing is worth asserting
   * rather than assuming.
   */
  describe("adminGrantCoins", () => {
    it("credits the wallet and the ledger together, leaving the books level", async () => {
      const before = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
      const sumDeltas = async () =>
        (await db.transaction.findMany({ where: { userId: sellerId } })).reduce(
          (total, row) => total + row.coinsDelta,
          0n,
        );
      const deltasBefore = await sumDeltas();

      await adminGrantCoins(db, "cli", {
        username: before.username,
        amount: 2_500n,
      });

      const after = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
      expect(after.coins).toBe(before.coins + 2_500n);

      const rows = await db.transaction.findMany({
        where: { userId: sellerId, type: "ADMIN_ADJUST" },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.coinsDelta).toBe(2_500n);

      // Wallet minus the sum of ledger deltas is the invariant the
      // reconciliation check reads; the grant must not move one alone.
      // Measured as a DIFFERENCE rather than an absolute, so the assertion
      // does not quietly depend on the fixture starting with no ledger.
      expect((await sumDeltas()) - deltasBefore).toBe(after.coins - before.coins);
    });

    it("is written to the audit log, so a grant is never silent", async () => {
      const target = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
      await adminGrantCoins(db, "cli", { username: target.username, amount: 10n });
      const events = await db.securityEvent.findMany({
        where: { type: "admin-action", message: { contains: target.username } },
      });
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((event) => event.message.includes("10 coins"))).toBe(true);
    });
  });
});
