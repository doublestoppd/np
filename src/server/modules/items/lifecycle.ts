import type { ItemLifecycle } from "@prisma/client";

/**
 * Item lifecycle policy (docs/conventions.md). One shared policy consulted
 * by catalogs, shops, listings, inventory actions, and admin operations:
 *
 * - DRAFT: not player-visible, not distributable.
 * - ACTIVE: fully functional.
 * - RETIRED: no longer newly distributed (excluded from restock pools and
 *   ordinary grants) but remains owned, visible, usable, and tradeable.
 * - DISABLED: emergency/moderation shutoff — invisible in catalogs,
 *   unusable, unpurchasable; existing ownership is preserved.
 *
 * Released items are never physically deleted.
 */

export const PLAYER_VISIBLE_LIFECYCLES: ItemLifecycle[] = ["ACTIVE", "RETIRED"];

export function isPlayerVisible(lifecycle: ItemLifecycle): boolean {
  return lifecycle === "ACTIVE" || lifecycle === "RETIRED";
}

/** May new copies enter circulation (restocks, ordinary grants)? */
export function isDistributable(lifecycle: ItemLifecycle): boolean {
  return lifecycle === "ACTIVE";
}

/** May owned copies be used (fed, played with)? */
export function isUsable(lifecycle: ItemLifecycle): boolean {
  return lifecycle === "ACTIVE" || lifecycle === "RETIRED";
}

/** May owned copies be sold via player shops (given item.tradeable)? */
export function isSellable(lifecycle: ItemLifecycle): boolean {
  return lifecycle === "ACTIVE" || lifecycle === "RETIRED";
}
