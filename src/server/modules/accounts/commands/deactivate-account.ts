import type { DbClient } from "@/server/db";
import { recordSecurityEvent } from "@/server/security/audit";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { releaseInstance } from "@/server/modules/items/ownership";

/**
 * Account deactivation (soft deletion — docs/conventions.md). Cascading
 * deletion through economy records is impossible by design (Restrict FKs);
 * this command instead:
 * - cancels all active listings and returns escrow to the owner,
 * - moves any unclaimed proceeds into the wallet (they were earned),
 * - deactivates the player shop and hides the public profile,
 * - invalidates every session and blocks future authentication.
 *
 * The ledger, provenance history, restock records, and sale rows are all
 * preserved under the account row, which is retained (display name intact
 * for historical records; a later legal-erasure workflow would anonymize
 * the row rather than delete it).
 */
export async function deactivateAccount(
  db: DbClient,
  { userId, reason }: { userId: string; reason: string },
): Promise<{ cancelledListings: number; claimedProceeds: bigint }> {
  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.deactivatedAt) {
      return { cancelledListings: 0, claimedProceeds: 0n };
    }

    // Cancel active listings, returning escrow.
    const listings = await tx.playerShopListing.findMany({
      where: { sellerId: userId, status: "ACTIVE" },
      include: { item: true },
    });
    for (const listing of listings) {
      await tx.playerShopListing.update({
        where: { id: listing.id },
        data: { status: "CANCELLED" },
      });
      if (listing.itemInstanceId) {
        await releaseInstance(tx, { userId, instanceId: listing.itemInstanceId });
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
        note: "Listing cancelled during account deactivation",
      });
    }

    // Earned proceeds belong to the player: claim them before closing.
    let claimedProceeds = 0n;
    const shop = await tx.playerShop.findUnique({ where: { ownerId: userId } });
    if (shop) {
      if (shop.unclaimedProceeds > 0n) {
        claimedProceeds = shop.unclaimedProceeds;
        await tx.playerShop.update({
          where: { id: shop.id },
          data: { unclaimedProceeds: 0n },
        });
        await creditCoins(tx, { userId, amount: claimedProceeds });
        await recordLedger(tx, {
          userId,
          type: "PROCEEDS_CLAIM",
          coinsDelta: claimedProceeds,
          note: "Till claimed during account deactivation",
        });
      }
      await tx.playerShop.update({
        where: { id: shop.id },
        data: { active: false },
      });
    }

    await tx.session.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: { deactivatedAt: new Date() },
    });

    return { cancelledListings: listings.length, claimedProceeds };
  });

  await recordSecurityEvent(db, {
    userId,
    type: "account-deactivated",
    severity: "info",
    message: `Account deactivated (${reason})`,
    metadata: {
      cancelledListings: result.cancelledListings,
      claimedProceeds: result.claimedProceeds.toString(),
    },
  });
  return result;
}
