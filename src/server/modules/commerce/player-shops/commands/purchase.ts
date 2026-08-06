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
  quantity: number;
  /** Serialized coins. */
  totalPrice: string;
  sellerUsername: string;
}

/**
 * Atomic player-shop purchase. The status flip (ACTIVE → SOLD) picks
 * exactly one winner; eligibility is evaluated through the shared policy
 * so disabled sellers/items/shops can never sell. Proceeds go to the
 * seller's shop till, never directly to the wallet.
 */
export async function purchaseListing(
  db: DbClient,
  {
    buyerId,
    listingId,
    idempotencyKey,
    now = new Date(),
  }: { buyerId: string; listingId: string; idempotencyKey: string; now?: Date },
): Promise<PlayerPurchaseResult> {
  await enforceCommerceRateLimit(db, "player-purchase", buyerId, now);
  await assertCommerceAccess(db, buyerId);

  const { result } = await withIdempotency<PlayerPurchaseResult>(
    db,
    {
      userId: buyerId,
      operation: "listing-purchase",
      key: idempotencyKey,
      requestHash: requestHash({ listingId }),
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
      if (listing.sellerId === buyerId) {
        throw new EconomyError("SELF_PURCHASE");
      }
      const verdict = isPlayerListingPurchasable(listing);
      if (!verdict.ok) {
        throw new EconomyError(verdict.code === "LISTING_NOT_ACTIVE" ? "ALREADY_SOLD" : verdict.code);
      }

      const won = await tx.playerShopListing.updateMany({
        where: { id: listingId, status: "ACTIVE" },
        data: { status: "SOLD", buyerId, soldAt: now },
      });
      if (won.count === 0) {
        throw new EconomyError("ALREADY_SOLD");
      }

      const totalPrice = listing.unitPrice * BigInt(listing.quantity);
      await debitCoins(tx, { userId: buyerId, amount: totalPrice });

      const buyerLedger = await recordLedger(tx, {
        userId: buyerId,
        type: "PLAYER_PURCHASE",
        counterpartyUserId: listing.sellerId,
        itemId: listing.itemId,
        itemInstanceId: listing.itemInstanceId,
        playerListingId: listing.id,
        quantity: listing.quantity,
        coinsDelta: -totalPrice,
        note: `Bought ${listing.quantity} × ${listing.item.name} from ${listing.seller.username}`,
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
          create: { userId: buyerId, itemId: listing.itemId, quantity: listing.quantity },
          update: { quantity: { increment: listing.quantity } },
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
        quantity: listing.quantity,
        coinsDelta: 0n,
        note: `Sold ${listing.quantity} × ${listing.item.name} — ${coinsToJSON(totalPrice)} coins added to the shop till`,
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
        quantity: listing.quantity,
        totalPrice: coinsToJSON(totalPrice),
        sellerUsername: listing.seller.username,
      };
    },
  );
  return result;
}
