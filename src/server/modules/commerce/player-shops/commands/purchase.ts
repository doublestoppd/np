import type { DbClient } from "@/server/db";
import { withIdempotency, requestHash } from "@/server/security/idempotency";
import { recordSecurityEvent } from "@/server/security/audit";
import { coinsToJSON } from "@/lib/money";
import { EconomyError } from "../../errors";
import { enforceCommerceRateLimit, HIGH_VALUE_THRESHOLD } from "../../config";
import { assertCommerceAccess, isPlayerListingPurchasable } from "../../policies";
import { debitCoins } from "../../wallet";
import { recordLedger } from "../../ledger";
import { transferEscrowedInstance } from "@/server/modules/items/ownership";

export interface PlayerPurchaseResult {
  [key: string]: string | number;
  listingId: string;
  itemSlug: string;
  itemName: string;
  /** Units bought in this purchase, not the size of the listing. */
  quantity: number;
  /** Units still on the shelf afterwards. */
  remaining: number;
  /** Serialized coins. */
  totalPrice: string;
  sellerUsername: string;
}

/**
 * Atomic player-shop purchase, in whole or in part.
 *
 * A listing of five is five things for sale, not one bundle, so a buyer
 * takes as many as they want and the rest stays on the shelf. `quantity`
 * on the row is what REMAINS: the guarded decrement is the concurrency
 * winner-picker (it can only succeed if that many are still there), and
 * the listing flips to SOLD exactly when it reaches zero. Two buyers
 * racing for the last three units cannot both get three — the second one
 * re-evaluates the guard after the first commits and is refused.
 *
 * Eligibility runs through the shared policy so disabled sellers, shops,
 * and items can never sell. Proceeds go to the seller's shop till, never
 * directly to their wallet.
 *
 * `expectedUnitPrice` is the price the buyer was shown. It is never used
 * AS the price — the charge is always recomputed from the stored row — it
 * is compared, so a seller repricing between render and submit refuses the
 * purchase instead of silently charging different terms.
 */
export async function purchaseListing(
  db: DbClient,
  {
    buyerId,
    listingId,
    quantity = 1,
    idempotencyKey,
    expectedUnitPrice,
    now = new Date(),
  }: {
    buyerId: string;
    listingId: string;
    /** How many units to take. Must not exceed what remains. */
    quantity?: number;
    idempotencyKey: string;
    expectedUnitPrice?: bigint;
    now?: Date;
  },
): Promise<{ result: PlayerPurchaseResult; replayed: boolean }> {
  await enforceCommerceRateLimit(db, "player-purchase", buyerId, now);
  await assertCommerceAccess(db, buyerId);

  const { result, replayed } = await withIdempotency<PlayerPurchaseResult>(
    db,
    {
      userId: buyerId,
      operation: "listing-purchase",
      key: idempotencyKey,
      requestHash: requestHash({ listingId, quantity }),
    },
    async (tx) => {
      const listing = await tx.playerShopListing.findUnique({
        where: { id: listingId },
        include: {
          item: true,
          shop: true,
          seller: {
            select: {
              id: true,
              username: true,
              commerceDisabledAt: true,
              deactivatedAt: true,
            },
          },
        },
      });
      if (!listing) {
        throw new EconomyError("LISTING_NOT_FOUND");
      }
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new EconomyError("INVALID_QUANTITY");
      }
      if (quantity > listing.quantity) {
        throw new EconomyError("NOT_ENOUGH_LISTED");
      }
      // An instanced copy is one object; "two of it" is not a thing that
      // can exist, so the request is a defect rather than a stock problem.
      if (listing.itemInstanceId && quantity !== 1) {
        throw new EconomyError("INVALID_QUANTITY");
      }
      if (listing.sellerId === buyerId) {
        throw new EconomyError("SELF_PURCHASE");
      }
      const verdict = isPlayerListingPurchasable(listing);
      if (!verdict.ok) {
        throw new EconomyError(verdict.code === "LISTING_NOT_ACTIVE" ? "ALREADY_SOLD" : verdict.code);
      }
      // The terms the buyer agreed to must still be the terms on offer.
      if (
        expectedUnitPrice !== undefined &&
        expectedUnitPrice !== listing.unitPrice
      ) {
        throw new EconomyError("CONCURRENT_MODIFICATION");
      }

      // The guard carries the price as well as the stock check: the seller
      // may reprice between the read above and this write (Postgres READ
      // COMMITTED re-evaluates the predicate against the latest committed
      // row). Without it the buyer would be charged the stale price while
      // the row stores the new one, permanently breaking the shop's
      // revenue/till reconciliation invariants. `quantity: { gte }` rather
      // than an equality check is what makes partial sales safe: it claims
      // these units specifically, so a concurrent buyer taking a different
      // slice succeeds and one taking the same units does not.
      const won = await tx.playerShopListing.updateMany({
        where: {
          id: listingId,
          status: "ACTIVE",
          unitPrice: listing.unitPrice,
          quantity: { gte: quantity },
        },
        data: { quantity: { decrement: quantity } },
      });
      if (won.count === 0) {
        // Someone took them first, or the terms moved under us.
        const current = await tx.playerShopListing.findUnique({
          where: { id: listingId },
          select: { status: true, quantity: true, unitPrice: true },
        });
        if (!current || current.status !== "ACTIVE") {
          throw new EconomyError("ALREADY_SOLD");
        }
        throw new EconomyError(
          current.quantity < quantity
            ? "NOT_ENOUGH_LISTED"
            : "CONCURRENT_MODIFICATION",
        );
      }

      // Emptying the shelf closes the listing. Read back rather than
      // computing from the stale snapshot: the row is locked by the update
      // above, so this is the authoritative remainder.
      const after = await tx.playerShopListing.findUniqueOrThrow({
        where: { id: listingId },
        select: { quantity: true },
      });
      const soldOut = after.quantity === 0;
      if (soldOut) {
        await tx.playerShopListing.update({
          where: { id: listingId },
          data: { status: "SOLD" },
        });
      }

      const totalPrice = listing.unitPrice * BigInt(quantity);
      await debitCoins(tx, { userId: buyerId, amount: totalPrice });

      const buyerLedger = await recordLedger(tx, {
        userId: buyerId,
        type: "PLAYER_PURCHASE",
        counterpartyUserId: listing.sellerId,
        itemId: listing.itemId,
        itemInstanceId: listing.itemInstanceId,
        playerListingId: listing.id,
        quantity,
        coinsDelta: -totalPrice,
        note: `Bought ${quantity} × ${listing.item.name} from ${listing.seller.username}`,
      });

      if (listing.itemInstanceId) {
        await transferEscrowedInstance(tx, {
          instanceId: listing.itemInstanceId,
          fromUserId: listing.sellerId,
          toUserId: buyerId,
          note: `Sold via ${listing.shop.name}`,
          sourceType: `player-shop:${listing.shop.slug}`,
          transactionId: buyerLedger.id,
          now,
        });
      } else {
        await tx.inventoryEntry.upsert({
          where: { userId_itemId: { userId: buyerId, itemId: listing.itemId } },
          create: { userId: buyerId, itemId: listing.itemId, quantity },
          update: { quantity: { increment: quantity } },
        });
      }

      await tx.playerShop.update({
        where: { id: listing.shopId },
        data: {
          unclaimedProceeds: { increment: totalPrice },
          lifetimeRevenue: { increment: totalPrice },
        },
      });

      await recordLedger(tx, {
        userId: listing.sellerId,
        type: "PLAYER_SALE",
        counterpartyUserId: buyerId,
        itemId: listing.itemId,
        itemInstanceId: listing.itemInstanceId,
        playerListingId: listing.id,
        quantity,
        coinsDelta: 0n,
        note: `Sold ${quantity} × ${listing.item.name} — ${coinsToJSON(totalPrice)} coins added to the shop till`,
        metadata: { proceeds: coinsToJSON(totalPrice) },
      });

      if (totalPrice >= HIGH_VALUE_THRESHOLD) {
        await recordSecurityEvent(tx, {
          userId: buyerId,
          type: "high-value-player-purchase",
          message: `Player purchase of listing ${listingId} for ${coinsToJSON(totalPrice)}`,
          metadata: {
            listingId,
            totalPrice: coinsToJSON(totalPrice),
            sellerId: listing.sellerId,
          },
        });
      }

      return {
        listingId: listing.id,
        itemSlug: listing.item.slug,
        itemName: listing.item.name,
        quantity,
        remaining: after.quantity,
        totalPrice: coinsToJSON(totalPrice),
        sellerUsername: listing.seller.username,
      };
    },
  );
  return { result, replayed };
}
