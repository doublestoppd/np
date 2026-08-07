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
import { isDistributable, isSellable } from "@/server/modules/items/lifecycle";

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
 *   listing. RETIRED items remain tradeable between players but are no
 *   longer sold by NPC shops: buying from a shelf mints a new copy, and
 *   `grantItem(reason: "distribution")` refuses a retired one.
 * - An inactive shop blocks purchases; escrow returns via cancellation or
 *   the admin disable operation.
 */

/**
 * How old an account must be before it can trade with **other players**.
 *
 * Player-to-player trade is lossless, uncapped and fee-free, and accounts
 * are free to make. A playtester built the obvious machine out of that:
 * twelve throwaway accounts, each signed up, paid its starter grant, spun
 * the wheel and solved the day's shared word puzzle, then bought a junk
 * item from the farmer's stall priced at exactly that account's balance.
 * 5,834 coins moved in twelve accounts at 21.8 seconds each — 1,338 coins
 * a minute, where a day of honest play is about 600.
 *
 * Every other lever is a tax on a machine that still works. This one
 * stops it: a mule cannot carry anything on the day it is made, so the
 * farm has to be kept alive rather than manufactured on demand. A real
 * new player loses nothing they would have used — on day one you have 200
 * coins, nothing worth listing, and the market has no urgency in it.
 *
 * It applies to the player market and **nothing else**. NPC shops, request
 * boards, and shop upgrades all stay open from the first minute: those
 * move no value between accounts, and gating them would take a brand-new
 * player's whole game away to stop a farm they are not running.
 */
export const TRADE_ELIGIBLE_AFTER_HOURS = 24;

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

/**
 * Asserts the account may trade with other players — everything
 * `assertCommerceAccess` requires, plus enough time on the account that it
 * is a player rather than a courier.
 */
export async function assertPlayerTradeAccess(
  db: DbReader,
  userId: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<void> {
  await assertCommerceAccess(db, userId);
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { createdAt: true },
  });
  const hours = (now.getTime() - user.createdAt.getTime()) / 3_600_000;
  if (hours < TRADE_ELIGIBLE_AFTER_HOURS) {
    throw new EconomyError("ACCOUNT_TOO_NEW");
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
  // Distributable, not merely visible: this shelf mints new copies, and the
  // read model in npc-shops/queries.ts filters on exactly the same rule so
  // a shown item is always a buyable one (docs/conventions.md).
  if (!isDistributable(stock.item.lifecycle)) {
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
