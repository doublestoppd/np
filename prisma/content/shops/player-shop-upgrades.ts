import type { UpgradeTierContent } from "../schemas";

/**
 * Player-shop capacity upgrade ladder. Prerequisite = owning the previous
 * tier; tiers must be contiguous from 1. Deactivate a tier (active: false)
 * to stop new purchases without touching existing owners.
 */
export const playerShopUpgradeTiers = [
  { tier: 1, name: "A Second Shelf", price: 500n, capacityBonus: 4, active: true },
  { tier: 2, name: "The Back Room", price: 2000n, capacityBonus: 4, active: true },
  { tier: 3, name: "A Proper Counter", price: 8000n, capacityBonus: 6, active: true },
  { tier: 4, name: "The Loft Extension", price: 25000n, capacityBonus: 6, active: true },
] satisfies readonly UpgradeTierContent[];
