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
    regionSlug: "dapplewood",
    locationSlug: "the-mossy-market",
    name: "The Mossy Market",
    description:
      "The grove's general stall for snacks, playthings, and the occasional shelf surprise.",
    keeperCopy:
      "The proprietor is a hedgehog of few words. The prices are on the shelves. The prices are not negotiable. Have a pleasant day.",
    keeperArtKey: "keeper-hedgehog",
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
      // Board ingredients. Deliberately a SUBSET of what the Hearth's
      // requests ask for, and priced above what those requests pay: you
      // can buy your way out of being one short, and you can never buy a
      // whole request at a profit. Before this, the boards and the shops
      // shared no items at all, so a player with a full purse had no way
      // to spend it on the thing they were stuck on — and "buy the
      // missing piece", the oldest move in this genre, did not exist.
      { itemSlug: "honey-oat-biscuit", shopRarity: "COMMON", price: 22n, weight: 65, minQuantity: 2, maxQuantity: 6 },
      { itemSlug: "berry-jam-toast", shopRarity: "COMMON", price: 25n, weight: 60, minQuantity: 2, maxQuantity: 6 },
      { itemSlug: "herb-flecked-bread", shopRarity: "COMMON", price: 22n, weight: 60, minQuantity: 2, maxQuantity: 6 },
      { itemSlug: "cinnamon-moss-cake", shopRarity: "UNCOMMON", price: 30n, weight: 45, minQuantity: 1, maxQuantity: 4 },
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
    regionSlug: "dapplewood",
    locationSlug: "toadstool-hollow",
    name: "The Fernlight Apothecary",
    description:
      "A crooked stall between the toadstools, selling remedies, rarities, and things in jars.",
    keeperCopy:
      "A stick insect in half-moon spectacles regards you over the counter. A small sign reads: 'Browsing is free. Touching is browsing with consequences.'",
    keeperArtKey: "keeper-stick-insect",
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
  {
    slug: "salt-larder",
    regionSlug: "saltmere",
    locationSlug: "the-salt-larder",
    name: "The Salt Larder",
    description:
      "The flats' dry store: preserved food, hard bread, and one shelf of things to keep a pet busy on a wet afternoon.",
    keeperCopy:
      "A tortoise keeps this counter and reaches it at her own pace. A card propped against the scales reads: 'Everything here keeps. So can you.'",
    keeperArtKey: "keeper-tortoise",
    // A staples shop: a wide common band, and it never stocks an
    // ultra-rare. The Found Counter is where the treasure is.
    config: {
      intervalMinutes: 480,
      targetListings: 8,
      commonMin: 4,
      commonMax: 5,
      uncommonMin: 2,
      uncommonMax: 3,
      rareMin: 0,
      rareMax: 1,
      ultraRareBps: 0,
      maxUltraRare: 0,
    },
    pool: [
      { itemSlug: "bittergreen-broth", shopRarity: "COMMON", price: 8n, weight: 110, minQuantity: 8, maxQuantity: 16 },
      { itemSlug: "hardtack-square", shopRarity: "COMMON", price: 9n, weight: 120, minQuantity: 8, maxQuantity: 18 },
      { itemSlug: "salt-crust-roll", shopRarity: "COMMON", price: 12n, weight: 100, minQuantity: 6, maxQuantity: 14 },
      { itemSlug: "honeyed-shoreberries", shopRarity: "COMMON", price: 15n, weight: 85, minQuantity: 5, maxQuantity: 12 },
      { itemSlug: "driftwood-whirligig", shopRarity: "COMMON", price: 28n, weight: 70, minQuantity: 3, maxQuantity: 8 },
      { itemSlug: "brine-pickled-roots", shopRarity: "UNCOMMON", price: 34n, weight: 60, minQuantity: 2, maxQuantity: 6 },
      { itemSlug: "knotwork-ball", shopRarity: "UNCOMMON", price: 42n, weight: 50, minQuantity: 2, maxQuantity: 5 },
      { itemSlug: "singing-jar", shopRarity: "UNCOMMON", price: 55n, weight: 40, minQuantity: 1, maxQuantity: 3 },
      { itemSlug: "storm-preserve", shopRarity: "RARE", price: 160n, weight: 35, minQuantity: 1, maxQuantity: 3 },
    ],
  },
  {
    slug: "boathouse-counter",
    regionSlug: "tarnreach",
    locationSlug: "the-boathouse",
    name: "The Boathouse Counter",
    description:
      "Hot things, dry things, and the sort of tackle that survives being sat on. Stock reflects what the weather has recently taught people to want.",
    keeperCopy:
      "A heron keeps this counter and gives the impression of having somewhere to be. A card by the till reads: 'The far side is further than it looks. Take the flask.'",
    keeperArtKey: "keeper-heron",
    config: {
      intervalMinutes: 360,
      targetListings: 7,
      commonMin: 4,
      commonMax: 5,
      uncommonMin: 1,
      uncommonMax: 2,
      rareMin: 0,
      rareMax: 1,
      ultraRareBps: 0,
      maxUltraRare: 0,
    },
    pool: [
      { itemSlug: "pine-needle-tea", shopRarity: "COMMON", price: 9n, weight: 120, minQuantity: 6, maxQuantity: 14 },
      { itemSlug: "barley-cordial", shopRarity: "COMMON", price: 12n, weight: 110, minQuantity: 5, maxQuantity: 12 },
      { itemSlug: "hot-blackcurrant", shopRarity: "COMMON", price: 14n, weight: 100, minQuantity: 5, maxQuantity: 12 },
      { itemSlug: "cloudberry-fizz", shopRarity: "COMMON", price: 17n, weight: 85, minQuantity: 4, maxQuantity: 10 },
      { itemSlug: "hardtack-square", shopRarity: "COMMON", price: 11n, weight: 80, minQuantity: 6, maxQuantity: 14 },
      { itemSlug: "juniper-warmer", shopRarity: "UNCOMMON", price: 34n, weight: 55, minQuantity: 2, maxQuantity: 5 },
      { itemSlug: "smoked-honey-toddy", shopRarity: "UNCOMMON", price: 42n, weight: 40, minQuantity: 1, maxQuantity: 4 },
      { itemSlug: "puzzle-pebbles", shopRarity: "UNCOMMON", price: 45n, weight: 35, minQuantity: 1, maxQuantity: 3 },
      { itemSlug: "storm-preserve", shopRarity: "RARE", price: 165n, weight: 25, minQuantity: 1, maxQuantity: 2 },
    ],
  },
  {
    slug: "raker-chit-table",
    regionSlug: "saltmere",
    locationSlug: "the-drying-sheds",
    name: "The Raker's Chit Table",
    description:
      "A plank across two salt barrels, and three stacks of slate chits under a weighted-down price list. The odds are printed on the list because the rakers got tired of being asked.",
    keeperCopy:
      "A heron works this table and does not hurry. The price list ends: 'These pay out less than they cost. That is how they can pay out at all. Buy one for the scraping, not for the living.'",
    keeperArtKey: "keeper-heron",
    // Exactly three listings, every restock, all three tiers. A chit
    // stall that sells out is a stall that manufactures scarcity, and
    // scarcity is the one thing a game of chance must not add.
    config: {
      intervalMinutes: 120,
      targetListings: 3,
      commonMin: 3,
      commonMax: 3,
      uncommonMin: 0,
      uncommonMax: 0,
      rareMin: 0,
      rareMax: 0,
      ultraRareBps: 0,
      maxUltraRare: 0,
    },
    pool: [
      { itemSlug: "thin-salt-chit", shopRarity: "COMMON", price: 60n, weight: 100, minQuantity: 25, maxQuantity: 40 },
      { itemSlug: "banded-salt-chit", shopRarity: "COMMON", price: 180n, weight: 100, minQuantity: 15, maxQuantity: 25 },
      { itemSlug: "black-salt-chit", shopRarity: "COMMON", price: 500n, weight: 100, minQuantity: 8, maxQuantity: 15 },
    ],
  },
  {
    slug: "found-counter",
    regionSlug: "saltmere",
    locationSlug: "the-found-counter",
    name: "The Found Counter",
    description:
      "Recovered things, priced and tagged. Nothing on this counter is new, and nothing on it was made here.",
    keeperCopy:
      "A heron works this counter and does not hurry for anybody. Every price is on a paper tag, and every tag says, in smaller letters, where the thing was found. The heron considers that the more important number.",
    keeperArtKey: "keeper-heron",
    // Small, slow and top-heavy: a shelf worth making the trip for.
    config: {
      intervalMinutes: 720,
      targetListings: 6,
      commonMin: 2,
      commonMax: 3,
      uncommonMin: 1,
      uncommonMax: 2,
      rareMin: 1,
      rareMax: 2,
      ultraRareBps: 500,
      maxUltraRare: 1,
    },
    pool: [
      // Salvage the Claims Board asks for — a subset, priced above what
      // the board pays, so buying the last piece is a move and buying the
      // whole claim never is.
      { itemSlug: "one-left-boot", shopRarity: "COMMON", price: 20n, weight: 70, minQuantity: 2, maxQuantity: 6 },
      { itemSlug: "chipped-enamel-mug", shopRarity: "COMMON", price: 20n, weight: 65, minQuantity: 2, maxQuantity: 6 },
      // Priced a little above the Larder, and the keeper knows it.
      { itemSlug: "tide-worn-tin", shopRarity: "COMMON", price: 8n, weight: 110, minQuantity: 6, maxQuantity: 14 },
      { itemSlug: "salt-crust-roll", shopRarity: "COMMON", price: 14n, weight: 80, minQuantity: 4, maxQuantity: 10 },
      { itemSlug: "driftwood-whirligig", shopRarity: "COMMON", price: 32n, weight: 70, minQuantity: 2, maxQuantity: 6 },
      { itemSlug: "singing-jar", shopRarity: "UNCOMMON", price: 60n, weight: 50, minQuantity: 1, maxQuantity: 3 },
      { itemSlug: "beacon-lamp-glass", shopRarity: "UNCOMMON", price: 90n, weight: 40, minQuantity: 1, maxQuantity: 2 },
      { itemSlug: "sailcloth-glider", shopRarity: "RARE", price: 240n, weight: 35, minQuantity: 1, maxQuantity: 2 },
      { itemSlug: "netted-glass-float", shopRarity: "RARE", price: 380n, weight: 22, minQuantity: 1, maxQuantity: 1 },
      { itemSlug: "salvagers-tide-clock", shopRarity: "RARE", price: 520n, weight: 16, minQuantity: 1, maxQuantity: 1 },
      { itemSlug: "unclaimed-lot-key", shopRarity: "ULTRA_RARE", price: 1800n, weight: 10, minQuantity: 1, maxQuantity: 1 },
    ],
  },
  {
    slug: "tumblehouse-counter",
    regionSlug: "saltmere",
    locationSlug: "the-tumblehouse",
    name: "The Tumblehouse Counter",
    description:
      "Tokens for the drums, and nothing else at all. The counter does not buy them back.",
    keeperCopy:
      "One token, one pull. The house does not change them back into coins and never has, so please do not be the fourth person today to ask.",
    keeperArtKey: "keeper-tumblehouse",
    /**
     * Tuned so the white token is always there and the rest are an
     * occasion (ADR-49).
     *
     * With two listings a window and only one COMMON entry in the pool,
     * every restock puts the chalk token out — a few at a time, never a
     * pile — and the second slot goes to a green, a blue, or an amber,
     * one third of windows each. The black token is an independent 0.8%
     * roll on top, which at this interval is a fortnight or so between
     * sightings.
     *
     * Do not raise `targetListings` without adding COMMON pool entries:
     * a shortfall backfills DOWNWARD, so asking for more than the pool
     * can supply at a tier pushes the surplus into cheaper tokens rather
     * than dearer ones. That is the safe direction, and it is also not
     * the direction anyone would intend.
     */
    config: {
      intervalMinutes: 180,
      targetListings: 2,
      commonMin: 1,
      commonMax: 2,
      uncommonMin: 0,
      uncommonMax: 1,
      rareMin: 0,
      rareMax: 1,
      ultraRareBps: 80,
      maxUltraRare: 1,
    },
    pool: [
      { itemSlug: "chalk-token", shopRarity: "COMMON", price: 120n, weight: 100, minQuantity: 2, maxQuantity: 4 },
      { itemSlug: "verdigris-token", shopRarity: "UNCOMMON", price: 400n, weight: 100, minQuantity: 1, maxQuantity: 2 },
      // Both blues and ambers share the RARE slot, so these weights are
      // what separates "occasionally" from "hardly ever".
      { itemSlug: "cobalt-token", shopRarity: "RARE", price: 1300n, weight: 85, minQuantity: 1, maxQuantity: 1 },
      { itemSlug: "amber-token", shopRarity: "RARE", price: 4000n, weight: 15, minQuantity: 1, maxQuantity: 1 },
      { itemSlug: "obsidian-token", shopRarity: "ULTRA_RARE", price: 12000n, weight: 10, minQuantity: 1, maxQuantity: 1 },
    ],
  },
  {
    slug: "quiet-bindery",
    regionSlug: "dapplewood",
    locationSlug: "the-quiet-bindery",
    name: "The Quiet Bindery",
    description:
      "Books, sewn at the back and sold at the front. Nothing else is for sale and the binder will say so.",
    keeperCopy:
      "Take it away and read it to something that will sit still for it. That is what it is for. No, I will not tell you which one is best.",
    keeperArtKey: "keeper-binder",
    config: {
      intervalMinutes: 360,
      targetListings: 8,
      commonMin: 4,
      commonMax: 6,
      uncommonMin: 1,
      uncommonMax: 3,
      rareMin: 0,
      rareMax: 2,
      ultraRareBps: 200,
      maxUltraRare: 1,
    },
    pool: [
      { itemSlug: "a-short-account-of-weather", shopRarity: "COMMON", price: 30n, weight: 100, minQuantity: 2, maxQuantity: 5 },
      { itemSlug: "knots-for-the-impatient", shopRarity: "COMMON", price: 34n, weight: 95, minQuantity: 2, maxQuantity: 5 },
      { itemSlug: "two-hundred-uses-for-moss", shopRarity: "COMMON", price: 38n, weight: 90, minQuantity: 2, maxQuantity: 5 },
      { itemSlug: "the-bee-book", shopRarity: "COMMON", price: 44n, weight: 90, minQuantity: 2, maxQuantity: 4 },
      { itemSlug: "on-walking-slowly", shopRarity: "COMMON", price: 48n, weight: 85, minQuantity: 2, maxQuantity: 4 },
      { itemSlug: "a-cooks-notes-on-roots", shopRarity: "COMMON", price: 55n, weight: 80, minQuantity: 1, maxQuantity: 4 },
      { itemSlug: "small-repairs", shopRarity: "COMMON", price: 62n, weight: 75, minQuantity: 1, maxQuantity: 3 },
      { itemSlug: "where-the-road-goes-abridged", shopRarity: "COMMON", price: 70n, weight: 70, minQuantity: 1, maxQuantity: 3 },
      { itemSlug: "the-tidewatchers-almanac", shopRarity: "UNCOMMON", price: 130n, weight: 60, minQuantity: 1, maxQuantity: 3 },
      { itemSlug: "names-for-rain", shopRarity: "UNCOMMON", price: 155n, weight: 55, minQuantity: 1, maxQuantity: 2 },
      { itemSlug: "bridges-i-have-crossed", shopRarity: "UNCOMMON", price: 180n, weight: 50, minQuantity: 1, maxQuantity: 2 },
      { itemSlug: "a-field-guide-to-things-that-are-not-there", shopRarity: "UNCOMMON", price: 205n, weight: 45, minQuantity: 1, maxQuantity: 2 },
      { itemSlug: "the-lamplighters-round", shopRarity: "UNCOMMON", price: 230n, weight: 40, minQuantity: 1, maxQuantity: 2 },
      { itemSlug: "nine-ways-to-sit-still", shopRarity: "UNCOMMON", price: 260n, weight: 35, minQuantity: 1, maxQuantity: 1 },
      { itemSlug: "the-deepwater-register", shopRarity: "RARE", price: 620n, weight: 40, minQuantity: 1, maxQuantity: 2 },
      { itemSlug: "letters-to-a-cartographer", shopRarity: "RARE", price: 780n, weight: 30, minQuantity: 1, maxQuantity: 1 },
      { itemSlug: "an-inventory-of-lost-bells", shopRarity: "RARE", price: 950n, weight: 22, minQuantity: 1, maxQuantity: 1 },
      { itemSlug: "the-long-winter-ledger", shopRarity: "RARE", price: 1200n, weight: 14, minQuantity: 1, maxQuantity: 1 },
      { itemSlug: "the-book-of-doors", shopRarity: "ULTRA_RARE", price: 3500n, weight: 20, minQuantity: 1, maxQuantity: 1 },
      { itemSlug: "the-unbound-folio", shopRarity: "ULTRA_RARE", price: 7500n, weight: 6, minQuantity: 1, maxQuantity: 1 },
    ],
  },
] satisfies readonly NpcShopContent[];
