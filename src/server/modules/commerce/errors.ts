import { DomainError } from "@/server/errors";

export type EconomyErrorCode =
  | "INSUFFICIENT_FUNDS"
  | "INSUFFICIENT_ITEMS"
  | "ITEM_NOT_FOUND"
  | "ITEM_INACTIVE"
  | "NOT_TRADEABLE"
  | "NOT_STACKABLE"
  | "INSTANCE_NOT_OWNED"
  | "OUT_OF_STOCK"
  | "LISTING_NOT_FOUND"
  | "LISTING_NOT_ACTIVE"
  | "ALREADY_SOLD"
  | "NOT_ENOUGH_LISTED"
  | "SELF_PURCHASE"
  | "SHOP_NOT_FOUND"
  | "SHOP_INACTIVE"
  | "SELLER_UNAVAILABLE"
  | "CAPACITY_FULL"
  | "NOTHING_TO_CLAIM"
  | "UPGRADE_ALREADY_OWNED"
  | "UPGRADE_PREREQUISITE_MISSING"
  | "UPGRADE_NOT_FOUND"
  | "INVALID_QUANTITY"
  | "INVALID_PRICE"
  | "INVALID_RESTOCK_CONFIG"
  | "COMMERCE_DISABLED"
  | "ACCOUNT_TOO_NEW"
  | "CONCURRENT_MODIFICATION"
  | "NOT_AUTHORIZED";

/**
 * Domain error for economic operations. `publicMessage` is safe to show
 * players; it avoids internal thresholds, stock math, and anti-abuse
 * details. Conflict messages state explicitly that the player was not
 * charged (docs/conventions.md error contract).
 */
export class EconomyError extends DomainError {
  constructor(public readonly economyCode: EconomyErrorCode) {
    super(economyCode, ECONOMY_MESSAGES[economyCode] ?? "That didn't work. Try again.");
    this.name = "EconomyError";
  }
}

/**
 * The player-facing copy for every economy failure. Exported so a test can
 * assert it all survives the feedback banner's sanitizer — copy that the
 * banner silently drops is worse than the phishing it filters.
 */
export const ECONOMY_MESSAGES: Record<EconomyErrorCode, string> = {
  INSUFFICIENT_FUNDS: "You don't have enough coins for that.",
  INSUFFICIENT_ITEMS: "You don't have enough of that item.",
  ITEM_NOT_FOUND: "That item could not be found.",
  ITEM_INACTIVE: "That item is not available right now. You were not charged.",
  NOT_TRADEABLE: "That item can't be sold or traded.",
  NOT_STACKABLE: "That item is one of a kind — list it individually.",
  INSTANCE_NOT_OWNED: "That item isn't yours to use.",
  OUT_OF_STOCK: "Too slow — that one's gone. You were not charged.",
  LISTING_NOT_FOUND: "That listing could not be found.",
  LISTING_NOT_ACTIVE: "That listing is no longer available. You were not charged.",
  ALREADY_SOLD: "Someone else got there first. You were not charged.",
  NOT_ENOUGH_LISTED:
    "There aren't that many left in this listing. You were not charged.",
  SELF_PURCHASE: "You can't buy from your own shop.",
  SHOP_NOT_FOUND: "That shop could not be found.",
  SHOP_INACTIVE: "That shop is closed right now. You were not charged.",
  SELLER_UNAVAILABLE: "That seller isn't trading right now. You were not charged.",
  CAPACITY_FULL: "Your shop shelves are full. Upgrade capacity or clear a slot.",
  NOTHING_TO_CLAIM: "The till is empty.",
  UPGRADE_ALREADY_OWNED: "You already own that upgrade.",
  UPGRADE_PREREQUISITE_MISSING: "You need the earlier upgrades first.",
  UPGRADE_NOT_FOUND: "That upgrade could not be found.",
  INVALID_QUANTITY: "That quantity isn't valid.",
  INVALID_PRICE: "That price isn't valid.",
  INVALID_RESTOCK_CONFIG: "Shop configuration error.",
  COMMERCE_DISABLED: "Commerce isn't available for this account.",
  ACCOUNT_TOO_NEW:
    "Trading with other players opens up after your first day here. Everything else is yours already.",
  CONCURRENT_MODIFICATION: "Things changed mid-action. You were not charged. Refresh and try again.",
  NOT_AUTHORIZED: "You aren't allowed to do that.",
};
