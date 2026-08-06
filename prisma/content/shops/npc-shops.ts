import type { NpcShopContent } from "../schemas";

/**
 * NPC shops with their restock pools. Pool entries are
 * SYNC_AND_DEACTIVATE_MISSING: removing an entry here deactivates it in
 * the database on the next seed (existing stocked shelves and purchase
 * history are untouched). Restock timing is never shown to players.
 */
export const npcShops = [
  {
    slug: "mossy-market",
    locationSlug: "the-mossy-market",
    name: "The Mossy Market",
    description:
      "The grove's general stall for snacks, playthings, and the occasional shelf surprise.",
    keeperCopy:
      "The proprietor is a hedgehog of few words. The prices are on the shelves. The prices are not negotiable. Have a pleasant day.",
    keeperArtKey: "keeper-hedgehog",
    artKey: "the-mossy-market",
    // Uses the documented default restock configuration.
    config: {},
    pool: [
      // Commons
      { itemSlug: "sunberry-cluster", shopRarity: "COMMON", price: 12n, weight: 100, minQuantity: 6, maxQuantity: 14 },
      { itemSlug: "honey-oat-loaf", shopRarity: "COMMON", price: 25n, weight: 80, minQuantity: 4, maxQuantity: 10 },
      { itemSlug: "crispleaf-salad", shopRarity: "COMMON", price: 18n, weight: 90, minQuantity: 5, maxQuantity: 12 },
      { itemSlug: "river-melon-slice", shopRarity: "COMMON", price: 20n, weight: 85, minQuantity: 4, maxQuantity: 10 },
      { itemSlug: "acorn-tea", shopRarity: "COMMON", price: 8n, weight: 110, minQuantity: 8, maxQuantity: 16 },
      { itemSlug: "riverweed-crisps", shopRarity: "COMMON", price: 14n, weight: 95, minQuantity: 6, maxQuantity: 12 },
      { itemSlug: "bounce-burr", shopRarity: "COMMON", price: 30n, weight: 70, minQuantity: 3, maxQuantity: 8 },
      { itemSlug: "unremarkable-acorn", shopRarity: "COMMON", price: 5n, weight: 120, minQuantity: 10, maxQuantity: 20 },
      { itemSlug: "pressed-fern-frond", shopRarity: "COMMON", price: 9n, weight: 75, minQuantity: 5, maxQuantity: 10 },
      // Uncommons
      { itemSlug: "toasted-nutcake", shopRarity: "UNCOMMON", price: 35n, weight: 60, minQuantity: 2, maxQuantity: 6 },
      { itemSlug: "whistle-feather", shopRarity: "UNCOMMON", price: 22n, weight: 55, minQuantity: 2, maxQuantity: 5 },
      { itemSlug: "puzzle-pebbles", shopRarity: "UNCOMMON", price: 45n, weight: 50, minQuantity: 2, maxQuantity: 5 },
      { itemSlug: "mossberry-jam", shopRarity: "UNCOMMON", price: 55n, weight: 45, minQuantity: 1, maxQuantity: 4 },
      { itemSlug: "tumble-top", shopRarity: "UNCOMMON", price: 60n, weight: 40, minQuantity: 1, maxQuantity: 3 },
      // Date-limited pool entry (explicit availability window, not a
      // season system): available until the end of 2026.
      {
        itemSlug: "sunshower-vial",
        shopRarity: "UNCOMMON",
        price: 90n,
        weight: 30,
        minQuantity: 1,
        maxQuantity: 2,
        availableUntil: "2027-01-01T00:00:00.000Z",
      },
      // Rares
      { itemSlug: "drizzle-cake", shopRarity: "RARE", price: 150n, weight: 40, minQuantity: 1, maxQuantity: 3 },
      { itemSlug: "echo-shell", shopRarity: "RARE", price: 220n, weight: 30, minQuantity: 1, maxQuantity: 2 },
      { itemSlug: "patchwork-kite", shopRarity: "RARE", price: 260n, weight: 25, minQuantity: 1, maxQuantity: 2 },
      // Ultra-rare
      { itemSlug: "gilded-acorn", shopRarity: "ULTRA_RARE", price: 1200n, weight: 10, minQuantity: 1, maxQuantity: 1 },
    ],
  },
  {
    slug: "fernlight-apothecary",
    locationSlug: "toadstool-hollow",
    name: "The Fernlight Apothecary",
    description:
      "A crooked stall between the toadstools, selling remedies, rarities, and things in jars.",
    keeperCopy:
      "A stick insect in half-moon spectacles regards you over the counter. A small sign reads: 'Browsing is free. Touching is browsing with consequences.'",
    keeperArtKey: "keeper-stick-insect",
    artKey: "toadstool-hollow",
    // Shop-specific override of the default schedule and composition.
    config: {
      intervalMinutes: 360,
      targetListings: 8,
      commonMin: 5,
      commonMax: 6,
      uncommonMin: 1,
      uncommonMax: 2,
      rareMin: 0,
      rareMax: 1,
    },
    pool: [
      { itemSlug: "acorn-tea", shopRarity: "COMMON", price: 10n, weight: 100, minQuantity: 5, maxQuantity: 12 },
      { itemSlug: "crispleaf-salad", shopRarity: "COMMON", price: 20n, weight: 80, minQuantity: 4, maxQuantity: 8 },
      { itemSlug: "pressed-fern-frond", shopRarity: "COMMON", price: 9n, weight: 90, minQuantity: 4, maxQuantity: 10 },
      { itemSlug: "riverweed-crisps", shopRarity: "COMMON", price: 16n, weight: 85, minQuantity: 4, maxQuantity: 10 },
      { itemSlug: "unremarkable-acorn", shopRarity: "COMMON", price: 6n, weight: 110, minQuantity: 8, maxQuantity: 16 },
      { itemSlug: "sunberry-cluster", shopRarity: "COMMON", price: 13n, weight: 95, minQuantity: 5, maxQuantity: 10 },
      { itemSlug: "mossberry-jam", shopRarity: "UNCOMMON", price: 60n, weight: 50, minQuantity: 1, maxQuantity: 3 },
      { itemSlug: "sunshower-vial", shopRarity: "UNCOMMON", price: 85n, weight: 40, minQuantity: 1, maxQuantity: 2 },
      // Shop-specific rarity differs from the item's general rarity
      // (river-glass-pebble is generally UNCOMMON; rare here).
      { itemSlug: "river-glass-pebble", shopRarity: "RARE", price: 40n, weight: 35, minQuantity: 1, maxQuantity: 2 },
      // An instanced item sold by an NPC shop.
      { itemSlug: "fernlight-lantern", shopRarity: "RARE", price: 400n, weight: 20, minQuantity: 1, maxQuantity: 1 },
      { itemSlug: "grovewardens-compass", shopRarity: "ULTRA_RARE", price: 2500n, weight: 10, minQuantity: 1, maxQuantity: 1 },
    ],
  },
] satisfies readonly NpcShopContent[];
