import type { DbClient } from "@/server/db";
import { withIdempotency, requestHash } from "@/server/security/idempotency";
import { LIMITS } from "@/server/security/limits";
import { MAX_MONEY_INPUT, MAX_TRANSACTION_TOTAL, coinLabel, coinsToJSON, formatCoins } from "@/lib/money";
import { EconomyError } from "../../errors";
import { enforceCommerceRateLimit } from "../../config";
import { assertCommerceAccess } from "../../policies";
import { recordLedger } from "../../ledger";
import {
  escrowInstance,
  grantItem,
  releaseInstance,
  removeItem,
} from "@/server/modules/items/ownership";
import { isSellable } from "@/server/modules/items/lifecycle";
import { ensurePlayerShop } from "./shop";

/**
 * Listing commands. The listing row IS the escrow for stackable
 * quantities; instances flip to ESCROWED. Creation is capacity-checked
 * under a per-shop advisory lock; cancellation returns escrow atomically.
 * Commerce-disabled sellers may still cancel (policy: docs/conventions.md)
 * but cannot create.
 */

function validateListingEconomics(quantity: number, unitPrice: bigint): void {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > LIMITS.stackQuantity
  ) {
    throw new EconomyError("INVALID_QUANTITY");
  }
  if (unitPrice < 1n || unitPrice > MAX_MONEY_INPUT) {
    throw new EconomyError("INVALID_PRICE");
  }
  if (BigInt(quantity) * unitPrice > MAX_TRANSACTION_TOTAL) {
    throw new EconomyError("INVALID_PRICE");
  }
}

/** JSON-safe reprice result (stored for idempotent replay). */
export type RepriceResult = {
  listingId: string;
  itemName: string;
  /** Serialized coins. */
  previousUnitPrice: string;
  /** Serialized coins. */
  unitPrice: string;
};

export interface ListingResult {
  [key: string]: string | number;
  listingId: string;
  itemSlug: string;
  /** Display name — confirmations are read by players, not by operators. */
  itemName: string;
  quantity: number;
  /** Serialized coins. */
  unitPrice: string;
}

export async function createListing(
  db: DbClient,
  {
    userId,
    itemId,
    itemInstanceId,
    quantity,
    unitPrice,
    idempotencyKey,
  }: {
    userId: string;
    itemId: string;
    itemInstanceId?: string | null;
    quantity: number;
    unitPrice: bigint;
    idempotencyKey: string;
  },
): Promise<{ result: ListingResult; replayed: boolean }> {
  validateListingEconomics(quantity, unitPrice);
  await enforceCommerceRateLimit(db, "listing-mutation", userId);
  await assertCommerceAccess(db, userId);
  const shop = await ensurePlayerShop(db, userId);
  if (!shop.active) {
    throw new EconomyError("SHOP_INACTIVE");
  }

  const { result, replayed } = await withIdempotency<ListingResult>(
    db,
    {
      userId,
      operation: "listing-create",
      key: idempotencyKey,
      requestHash: requestHash({
        itemId,
        itemInstanceId,
        quantity,
        unitPrice: coinsToJSON(unitPrice),
      }),
    },
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"pshop:" + shop.id}))`;

      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item) {
        throw new EconomyError("ITEM_NOT_FOUND");
      }
      if (!isSellable(item.lifecycle)) {
        throw new EconomyError("ITEM_INACTIVE");
      }
      if (!item.tradeable) {
        throw new EconomyError("NOT_TRADEABLE");
      }

      // Both halves of the comparison come from inside the lock. The
      // count already did; the capacity did not, and a capacity upgrade
      // commits under this same lock — so a player who bought a slot and
      // immediately listed was refused against the pre-upgrade number.
      const current = await tx.playerShop.findUniqueOrThrow({
        where: { id: shop.id },
        select: { active: true, listingCapacity: true },
      });
      if (!current.active) {
        throw new EconomyError("SHOP_INACTIVE");
      }
      const activeCount = await tx.playerShopListing.count({
        where: { shopId: shop.id, status: "ACTIVE" },
      });
      if (activeCount >= current.listingCapacity) {
        throw new EconomyError("CAPACITY_FULL");
      }

      if (itemInstanceId) {
        if (quantity !== 1) {
          throw new EconomyError("INVALID_QUANTITY");
        }
        const instance = await tx.itemInstance.findUnique({
          where: { id: itemInstanceId },
        });
        if (!instance || instance.itemId !== itemId) {
          throw new EconomyError("INSTANCE_NOT_OWNED");
        }
        await escrowInstance(tx, { userId, instanceId: itemInstanceId });
      } else {
        if (!item.stackable) {
          throw new EconomyError("NOT_STACKABLE");
        }
        await removeItem(tx, { userId, itemId, quantity });
      }

      const listing = await tx.playerShopListing.create({
        data: {
          shopId: shop.id,
          sellerId: userId,
          itemId,
          itemInstanceId: itemInstanceId ?? null,
          quantity,
          quantityListed: quantity,
          unitPrice,
        },
      });

      await recordLedger(tx, {
        userId,
        type: "PLAYER_LISTING_CREATE",
        itemId,
        itemInstanceId: itemInstanceId ?? null,
        playerListingId: listing.id,
        quantity,
        note: `Listed ${quantity} × ${item.name} at ${formatCoins(unitPrice)} ${coinLabel(unitPrice)} each`,
      });

      return {
        listingId: listing.id,
        itemSlug: item.slug,
        // The name, because the confirmation is read by a player: the slug
        // alone produced "Listed 3 × sunberry-cluster".
        itemName: item.name,
        quantity,
        unitPrice: coinsToJSON(unitPrice),
      };
    },
  );
  return { result, replayed };
}

/** Price changes are allowed while active; quantity changes are not. */
/**
 * Repricing changes the terms of goods already in escrow, so it is a
 * ledgered mutation like every other: one transaction, an idempotency key,
 * a guarded write, and a history row.
 *
 * It used to read the listing on the root client, validate against that
 * snapshot, and write it back guarded only on `{id, sellerId, status}` —
 * a read that fed a write from outside the writing transaction, which
 * docs/conventions.md forbids precisely because the row can move in
 * between. The guard now carries the price and remaining quantity the
 * validation was performed against, so a concurrent purchase or reprice
 * makes this one fail rather than silently write against stale terms.
 *
 * The ledger row records both prices and moves no coins. A reprice was
 * previously invisible in history even though it changed what a buyer
 * would be charged, which also made reconciliation's revenue check
 * unreconstructable from the listing alone.
 */
export async function updateListingPrice(
  db: DbClient,
  {
    userId,
    listingId,
    unitPrice,
    idempotencyKey,
  }: {
    userId: string;
    listingId: string;
    unitPrice: bigint;
    idempotencyKey: string;
  },
): Promise<{ result: RepriceResult; replayed: boolean }> {
  await enforceCommerceRateLimit(db, "listing-mutation", userId);
  return withIdempotency<RepriceResult>(
    db,
    {
      userId,
      operation: "listing-reprice",
      key: idempotencyKey,
      requestHash: requestHash({ listingId, unitPrice: unitPrice.toString() }),
    },
    async (tx) => {
      const listing = await tx.playerShopListing.findUnique({
        where: { id: listingId },
        include: { item: true },
      });
      if (!listing || listing.sellerId !== userId) {
        throw new EconomyError("LISTING_NOT_FOUND");
      }
      if (listing.status !== "ACTIVE") {
        throw new EconomyError("LISTING_NOT_ACTIVE");
      }
      validateListingEconomics(listing.quantity, unitPrice);

      const updated = await tx.playerShopListing.updateMany({
        where: {
          id: listingId,
          sellerId: userId,
          status: "ACTIVE",
          // The terms the validation above was performed against.
          unitPrice: listing.unitPrice,
          quantity: listing.quantity,
        },
        data: { unitPrice },
      });
      if (updated.count === 0) {
        throw new EconomyError("CONCURRENT_MODIFICATION");
      }

      await recordLedger(tx, {
        userId,
        type: "PLAYER_LISTING_REPRICE",
        itemId: listing.itemId,
        itemInstanceId: listing.itemInstanceId,
        playerListingId: listing.id,
        quantity: listing.quantity,
        note: `Repriced ${listing.item.name} from ${formatCoins(listing.unitPrice)} to ${formatCoins(unitPrice)} ${coinLabel(unitPrice)} each`,
      });

      return {
        listingId: listing.id,
        itemName: listing.item.name,
        previousUnitPrice: coinsToJSON(listing.unitPrice),
        unitPrice: coinsToJSON(unitPrice),
      };
    },
  );
}

/**
 * Cancels an active listing and returns the escrow immediately. Permitted
 * for commerce-disabled sellers (recovering their own goods is safe).
 */
export async function cancelListing(
  db: DbClient,
  {
    userId,
    listingId,
    idempotencyKey,
  }: { userId: string; listingId: string; idempotencyKey: string },
): Promise<{ result: ListingResult; replayed: boolean }> {
  await enforceCommerceRateLimit(db, "listing-mutation", userId);

  const { result, replayed } = await withIdempotency<ListingResult>(
    db,
    {
      userId,
      operation: "listing-cancel",
      key: idempotencyKey,
      requestHash: requestHash({ listingId }),
    },
    async (tx) => {
      const claimed = await tx.playerShopListing.updateMany({
        where: { id: listingId, sellerId: userId, status: "ACTIVE" },
        data: { status: "CANCELLED" },
      });
      if (claimed.count === 0) {
        throw new EconomyError("LISTING_NOT_ACTIVE");
      }
      const listing = await tx.playerShopListing.findUniqueOrThrow({
        where: { id: listingId },
        include: { item: true },
      });

      // Ledger first, so the grant can link the provenance event to the
      // row that caused it (same ordering as the admin escrow return).
      const ledger = await recordLedger(tx, {
        userId,
        type: "PLAYER_LISTING_CANCEL",
        itemId: listing.itemId,
        itemInstanceId: listing.itemInstanceId,
        playerListingId: listing.id,
        quantity: listing.quantity,
        note: `Cancelled listing of ${listing.quantity} × ${listing.item.name}`,
      });

      if (listing.itemInstanceId) {
        await releaseInstance(tx, {
          userId,
          instanceId: listing.itemInstanceId,
        });
      } else {
        await grantItem(tx, {
          userId,
          item: listing.item,
          quantity: listing.quantity,
          // The seller's own goods coming home. Allowed for any lifecycle:
          // an item retired or disabled while listed must still return.
          reason: "restoration",
          source: "player-shop:cancelled",
          transactionId: ledger.id,
        });
      }

      return {
        listingId: listing.id,
        itemSlug: listing.item.slug,
        itemName: listing.item.name,
        quantity: listing.quantity,
        unitPrice: coinsToJSON(listing.unitPrice),
      };
    },
  );
  return { result, replayed };
}
