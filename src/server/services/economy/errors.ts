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
  | "SELF_PURCHASE"
  | "SHOP_NOT_FOUND"
  | "SHOP_INACTIVE"
  | "CAPACITY_FULL"
  | "NOTHING_TO_CLAIM"
  | "UPGRADE_ALREADY_OWNED"
  | "UPGRADE_PREREQUISITE_MISSING"
  | "UPGRADE_NOT_FOUND"
  | "INVALID_QUANTITY"
  | "INVALID_PRICE"
  | "INVALID_RESTOCK_CONFIG"
  | "COMMERCE_DISABLED"
  | "RATE_LIMITED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "OPERATION_IN_PROGRESS"
  | "CONCURRENT_MODIFICATION"
  | "NOT_AUTHORIZED";

/**
 * Domain error for economic operations. `publicMessage` is safe to show
 * players; it deliberately avoids internal thresholds, stock math, and
 * anti-abuse details.
 */
export class EconomyError extends Error {
  constructor(public readonly code: EconomyErrorCode) {
    super(code);
    this.name = "EconomyError";
  }

  get publicMessage(): string {
    return PUBLIC_MESSAGES[this.code] ?? "That didn't work. Try again.";
  }
}

const PUBLIC_MESSAGES: Record<EconomyErrorCode, string> = {
  INSUFFICIENT_FUNDS: "You don't have enough coins for that.",
  INSUFFICIENT_ITEMS: "You don't have enough of that item.",
  ITEM_NOT_FOUND: "That item could not be found.",
  ITEM_INACTIVE: "That item is not available right now.",
  NOT_TRADEABLE: "That item can't be sold or traded.",
  NOT_STACKABLE: "That item is one of a kind — list it individually.",
  INSTANCE_NOT_OWNED: "That item isn't yours to use.",
  OUT_OF_STOCK: "Too slow — that one's gone.",
  LISTING_NOT_FOUND: "That listing could not be found.",
  LISTING_NOT_ACTIVE: "That listing is no longer available.",
  ALREADY_SOLD: "Someone else got there first.",
  SELF_PURCHASE: "You can't buy from your own shop.",
  SHOP_NOT_FOUND: "That shop could not be found.",
  SHOP_INACTIVE: "That shop is closed right now.",
  CAPACITY_FULL: "Your shop shelves are full. Upgrade capacity or clear a slot.",
  NOTHING_TO_CLAIM: "The till is empty.",
  UPGRADE_ALREADY_OWNED: "You already own that upgrade.",
  UPGRADE_PREREQUISITE_MISSING: "You need the earlier upgrades first.",
  UPGRADE_NOT_FOUND: "That upgrade could not be found.",
  INVALID_QUANTITY: "That quantity isn't valid.",
  INVALID_PRICE: "That price isn't valid.",
  INVALID_RESTOCK_CONFIG: "Shop configuration error.",
  COMMERCE_DISABLED: "Commerce isn't available for this account.",
  RATE_LIMITED: "Take a breath — you're going a little fast. Try again shortly.",
  IDEMPOTENCY_KEY_REUSED: "That request doesn't match its original. Refresh and try again.",
  OPERATION_IN_PROGRESS: "That request is already being processed. Give it a moment.",
  CONCURRENT_MODIFICATION: "Things changed mid-action. Refresh and try again.",
  NOT_AUTHORIZED: "You aren't allowed to do that.",
};
