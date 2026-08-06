import type {
  Item,
  NpcShop,
  NpcShopStock,
  PlayerShop,
  PlayerShopListing,
  Prisma,
  User,
} from "@prisma/client";
import type { DbReader } from "@/server/db";
import { EconomyError } from "./errors";
import { isPlayerVisible, isSellable } from "@/server/modules/items/lifecycle";

/**
 * Centralized commerce eligibility (docs/conventions.md). Reads and
 * purchases consult the same policy so a listing can never be purchasable
 * in one code path and blocked in another.
 *
 * Administrative deactivation semantics (the safer default, tested):
 * - A commerce-disabled or deactivated seller's listings are NOT
 *   purchasable and the seller cannot create listings — but the seller MAY
 *   still cancel listings and claim previously earned proceeds.
 * - A DISABLED (or DRAFT) item is never purchasable, even via an existing
 *   listing. RETIRED items remain tradeable.
 * - An inactive shop blocks purchases; escrow returns via cancellation or
 *   the admin disable operation.
 */

/** Asserts the account may initiate new commerce (buy, list, upgrade). */
export async function assertCommerceAccess(
  db: DbReader,
  userId: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { commerceDisabledAt: true, deactivatedAt: true },
  });
  if (!user || user.commerceDisabledAt !== null || user.deactivatedAt !== null) {
    throw new EconomyError("COMMERCE_DISABLED");
  }
}

export type PurchasabilityVerdict =
  | { ok: true }
  | { ok: false; code: "OUT_OF_STOCK" | "ITEM_INACTIVE" | "SHOP_INACTIVE" };

export function isNpcListingPurchasable(
  stock: NpcShopStock & { item: Item; shop: NpcShop },
): PurchasabilityVerdict {
  if (!stock.shop.active) return { ok: false, code: "SHOP_INACTIVE" };
  if (stock.status !== "ACTIVE" || stock.quantity <= 0) {
    return { ok: false, code: "OUT_OF_STOCK" };
  }
  if (!isPlayerVisible(stock.item.lifecycle)) {
    return { ok: false, code: "ITEM_INACTIVE" };
  }
  return { ok: true };
}

export type PlayerListingVerdict =
  | { ok: true }
  | {
      ok: false;
      code: "LISTING_NOT_ACTIVE" | "SHOP_INACTIVE" | "SELLER_UNAVAILABLE" | "ITEM_INACTIVE" | "NOT_TRADEABLE";
    };

export function isPlayerListingPurchasable(
  listing: PlayerShopListing & {
    item: Item;
    shop: PlayerShop;
    seller: Pick<User, "commerceDisabledAt" | "deactivatedAt">;
  },
): PlayerListingVerdict {
  if (listing.status !== "ACTIVE") return { ok: false, code: "LISTING_NOT_ACTIVE" };
  if (!listing.shop.active) return { ok: false, code: "SHOP_INACTIVE" };
  if (
    listing.seller.commerceDisabledAt !== null ||
    listing.seller.deactivatedAt !== null
  ) {
    return { ok: false, code: "SELLER_UNAVAILABLE" };
  }
  if (!isSellable(listing.item.lifecycle)) return { ok: false, code: "ITEM_INACTIVE" };
  if (!listing.item.tradeable) return { ok: false, code: "NOT_TRADEABLE" };
  return { ok: true };
}

/**
 * Prisma filter matching exactly the listings isPlayerListingPurchasable
 * accepts — used by every public read so browsing and buying agree.
 */
export function purchasablePlayerListingWhere(): Prisma.PlayerShopListingWhereInput {
  return {
    status: "ACTIVE",
    shop: { active: true },
    seller: { commerceDisabledAt: null, deactivatedAt: null },
    item: { lifecycle: { in: ["ACTIVE", "RETIRED"] }, tradeable: true },
  };
}
