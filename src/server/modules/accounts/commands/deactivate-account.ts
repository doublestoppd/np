import type { DbClient, DbTx } from "@/server/db";
import { recordSecurityEvent } from "@/server/security/audit";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { grantItem, releaseInstance } from "@/server/modules/items/ownership";
import { log } from "@/server/logging";

/**
 * Account deactivation (soft deletion — docs/conventions.md). Cascading
 * deletion through economy records is impossible by design (Restrict FKs);
 * this command instead:
 * - cancels all active listings and returns escrow to the owner,
 * - closes the shop so no further sale can land,
 * - moves any unclaimed proceeds into the wallet (they were earned),
 * - invalidates every session and blocks future authentication.
 *
 * Every step uses the same guarded-write discipline as the ordinary
 * commerce commands, because deactivation races with live buyers:
 * - the deactivation itself is claimed with a guarded update, so two
 *   concurrent requests cannot both run the payout;
 * - each listing is cancelled with a `status: "ACTIVE"` guard, so a
 *   listing sold mid-flight is never rewritten to CANCELLED (which would
 *   return escrow to the seller after the buyer already received it);
 * - the till is claimed with an amount guard AFTER the shop is closed, so
 *   a sale that commits during deactivation is still paid out rather than
 *   silently zeroed.
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
    // Claim the deactivation first. The guard makes a concurrent second
    // request a no-op instead of a second payout, and the row lock
    // serializes the two transactions.
    const claimed = await tx.user.updateMany({
      where: { id: userId, deactivatedAt: null },
      data: { deactivatedAt: new Date() },
    });
    if (claimed.count === 0) {
      return { cancelledListings: 0, claimedProceeds: 0n };
    }

    // Cancel active listings, returning escrow.
    const listings = await tx.playerShopListing.findMany({
      where: { sellerId: userId, status: "ACTIVE" },
      include: { item: true },
    });
    let cancelledListings = 0;
    for (const listing of listings) {
      const won = await tx.playerShopListing.updateMany({
        where: { id: listing.id, status: "ACTIVE" },
        data: { status: "CANCELLED" },
      });
      if (won.count === 0) {
        // A buyer completed this sale between the read above and here.
        // The sale stands: the buyer has the item and the proceeds are in
        // the till, which this command claims below.
        log.info("deactivate.listing-sold-mid-flight", {
          userId,
          listingId: listing.id,
        });
        continue;
      }
      cancelledListings += 1;
      const ledger = await recordLedger(tx, {
        userId,
        type: "PLAYER_LISTING_CANCEL",
        itemId: listing.itemId,
        itemInstanceId: listing.itemInstanceId,
        playerListingId: listing.id,
        quantity: listing.quantity,
        note: "Listing cancelled during account deactivation",
      });
      if (listing.itemInstanceId) {
        await releaseInstance(tx, { userId, instanceId: listing.itemInstanceId });
      } else {
        await grantItem(tx, {
          userId,
          item: listing.item,
          quantity: listing.quantity,
          reason: "restoration",
          source: "account-deactivation",
          transactionId: ledger.id,
        });
      }
    }

    // Close the shop BEFORE claiming the till: with the shop inactive and
    // every listing cancelled, no further sale can add proceeds, so the
    // amount read next cannot go stale underneath us.
    const shop = await tx.playerShop.findUnique({ where: { ownerId: userId } });
    let claimedProceeds = 0n;
    if (shop) {
      await tx.playerShop.update({
        where: { id: shop.id },
        data: { active: false },
      });
      claimedProceeds = await claimTill(tx, userId, shop.id);
    }

    await tx.session.deleteMany({ where: { userId } });

    return { cancelledListings, claimedProceeds };
  });

  if (result.cancelledListings > 0 || result.claimedProceeds > 0n) {
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
  }
  return result;
}

/**
 * Moves the till into the wallet with an amount-guarded update, mirroring
 * `claimProceeds`. A sale committing between the read and the write loses
 * the guard, so the amount is re-read and the claim retried — the money is
 * paid out rather than zeroed or double-credited.
 */
async function claimTill(
  tx: DbTx,
  userId: string,
  shopId: string,
): Promise<bigint> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await tx.playerShop.findUniqueOrThrow({
      where: { id: shopId },
      select: { unclaimedProceeds: true },
    });
    const amount = current.unclaimedProceeds;
    if (amount <= 0n) {
      return 0n;
    }
    const cleared = await tx.playerShop.updateMany({
      where: { id: shopId, unclaimedProceeds: amount },
      data: { unclaimedProceeds: 0n },
    });
    if (cleared.count === 0) {
      continue;
    }
    await creditCoins(tx, { userId, amount });
    await recordLedger(tx, {
      userId,
      type: "PROCEEDS_CLAIM",
      coinsDelta: amount,
      note: "Till claimed during account deactivation",
    });
    return amount;
  }
  // Three losses in a row is implausible once the shop is closed; leave the
  // till intact rather than guessing, and make it visible to operators.
  log.error("deactivate.till-claim-contended", { userId, shopId });
  return 0n;
}
