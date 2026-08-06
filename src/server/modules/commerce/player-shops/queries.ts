import type { DbClient } from "@/server/db";
import { purchasablePlayerListingWhere } from "../policies";

/**
 * Read models for player shops. Public reads use the same purchasability
 * filter as the purchase command, so browsing and buying always agree.
 */

/** Public storefront: shop, owner identity, and purchasable listings. */
export async function getPublicShop(db: DbClient, slug: string) {
  const shop = await db.playerShop.findFirst({
    where: {
      slug,
      active: true,
      owner: { deactivatedAt: null },
    },
    include: { owner: { select: { id: true, username: true } } },
  });
  if (!shop) {
    return null;
  }
  const listings = await db.playerShopListing.findMany({
    where: { shopId: shop.id, ...purchasablePlayerListingWhere() },
    include: { item: { include: { category: true } } },
    orderBy: [{ unitPrice: "asc" }, { createdAt: "asc" }],
  });
  return { shop, listings };
}

/** Owner dashboard view model. */
export async function getOwnerDashboard(db: DbClient, shopId: string) {
  const [listings, sales] = await Promise.all([
    db.playerShopListing.findMany({
      where: { shopId, status: "ACTIVE" },
      include: { item: { include: { category: true } } },
      orderBy: { createdAt: "asc" },
    }),
    // A sale is a ledger event, not a listing state: partial purchases
    // mean one listing can be sold to several buyers on several days, and
    // the listing row can only ever remember one of them.
    db.transaction.findMany({
      where: { type: "PLAYER_SALE", playerListing: { shopId } },
      include: {
        item: { select: { name: true, slug: true } },
        counterparty: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  return { listings, sales };
}

/** Active player-shop listings for one item, cheapest first. */
export async function listingsForItem(
  db: DbClient,
  itemId: string,
  { take = 20 }: { take?: number } = {},
) {
  return db.playerShopListing.findMany({
    where: { itemId, ...purchasablePlayerListingWhere() },
    include: {
      shop: { select: { slug: true, name: true } },
      seller: { select: { username: true } },
    },
    orderBy: [{ unitPrice: "asc" }, { createdAt: "asc" }],
    take: Math.min(take, 50),
  });
}
