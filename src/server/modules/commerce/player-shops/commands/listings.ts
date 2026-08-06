import type { DbClient } from "@/server/db";
import { withIdempotency, requestHash } from "@/server/security/idempotency";
import { LIMITS } from "@/server/security/limits";
import { coinsToJSON, MAX_MONEY_INPUT, MAX_TRANSACTION_TOTAL } from "@/lib/money";
import { EconomyError } from "../../errors";
import { enforceCommerceRateLimit } from "../../config";
import { assertCommerceAccess } from "../../policies";
import { recordLedger } from "../../ledger";
import {
  escrowInstance,
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

export interface ListingResult {
  [key: string]: string | number;
  listingId: string;
  itemSlug: string;
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
): Promise<ListingResult> {
  validateListingEconomics(quantity, unitPrice);
  await enforceCommerceRateLimit(db, "listing-mutation", userId);
  await assertCommerceAccess(db, userId);
  const shop = await ensurePlayerShop(db, userId);
  if (!shop.active) {
    throw new EconomyError("SHOP_INACTIVE");
  }

  const { result } = await withIdempotency<ListingResult>(
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

      const activeCount = await tx.playerShopListing.count({
        where: { shopId: shop.id, status: "ACTIVE" },
      });
      if (activeCount >= shop.listingCapacity) {
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
        note: `Listed ${quantity} × ${item.name} at ${coinsToJSON(unitPrice)} coins each`,
      });

      return {
        listingId: listing.id,
        itemSlug: item.slug,
        quantity,
        unitPrice: coinsToJSON(unitPrice),
      };
    },
  );
  return result;
}

/** Price changes are allowed while active; quantity changes are not. */
export async function updateListingPrice(
  db: DbClient,
  {
    userId,
    listingId,
    unitPrice,
  }: { userId: string; listingId: string; unitPrice: bigint },
): Promise<void> {
  await enforceCommerceRateLimit(db, "listing-mutation", userId);
  const listing = await db.playerShopListing.findUnique({
    where: { id: listingId },
  });
  if (!listing || listing.sellerId !== userId) {
    throw new EconomyError("LISTING_NOT_FOUND");
  }
  validateListingEconomics(listing.quantity, unitPrice);
  const updated = await db.playerShopListing.updateMany({
    where: { id: listingId, sellerId: userId, status: "ACTIVE" },
    data: { unitPrice },
  });
  if (updated.count === 0) {
    throw new EconomyError("LISTING_NOT_ACTIVE");
  }
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
): Promise<ListingResult> {
  await enforceCommerceRateLimit(db, "listing-mutation", userId);

  const { result } = await withIdempotency<ListingResult>(
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

      if (listing.itemInstanceId) {
        await releaseInstance(tx, {
          userId,
          instanceId: listing.itemInstanceId,
        });
      } else {
        await tx.inventoryEntry.upsert({
          where: { userId_itemId: { userId, itemId: listing.itemId } },
          create: { userId, itemId: listing.itemId, quantity: listing.quantity },
          update: { quantity: { increment: listing.quantity } },
        });
      }

      await recordLedger(tx, {
        userId,
        type: "PLAYER_LISTING_CANCEL",
        itemId: listing.itemId,
        itemInstanceId: listing.itemInstanceId,
        playerListingId: listing.id,
        quantity: listing.quantity,
        note: `Cancelled listing of ${listing.quantity} × ${listing.item.name}`,
      });

      return {
        listingId: listing.id,
        itemSlug: listing.item.slug,
        quantity: listing.quantity,
        unitPrice: coinsToJSON(listing.unitPrice),
      };
    },
  );
  return result;
}
