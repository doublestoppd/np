import {
  PrismaClient,
  ItemType,
  Rarity,
  ProvenancePolicy,
} from "@prisma/client";

const prisma = new PrismaClient();

const SPECIES = [
  {
    slug: "cindertail",
    name: "Cindertail",
    description:
      "A warm-hearted ember salamander whose tail tip glows softly when it is happy.",
    artKey: "cindertail",
  },
  {
    slug: "thornbud",
    name: "Thornbud",
    description:
      "A leafy sprout companion that grows a new petal for every day it is well cared for.",
    artKey: "thornbud",
  },
  {
    slug: "mistfin",
    name: "Mistfin",
    description:
      "A cheerful pond-dweller with feathery fins that ripple like morning fog on water.",
    artKey: "mistfin",
  },
] as const;

const CATEGORIES = [
  {
    slug: "food",
    name: "Food",
    description: "Things that are, at least in principle, edible.",
    sortOrder: 0,
  },
  {
    slug: "toys",
    name: "Toys",
    description: "Things that exist to be chased, squeaked, or stacked.",
    sortOrder: 1,
  },
  {
    slug: "curios",
    name: "Curios",
    description: "Things whose entire job is to be kept.",
    sortOrder: 2,
  },
] as const;

const TAGS = [
  { slug: "sweet", name: "Sweet" },
  { slug: "baked", name: "Baked" },
  { slug: "foraged", name: "Foraged" },
  { slug: "river", name: "River" },
  { slug: "woodland", name: "Woodland" },
  { slug: "keepsake", name: "Keepsake" },
] as const;

interface SeedItem {
  slug: string;
  name: string;
  description: string;
  type: ItemType | null;
  category: string;
  tags: string[];
  price: number;
  rarity: Rarity;
  tradeable?: boolean;
  stackable?: boolean;
  provenancePolicy?: ProvenancePolicy;
  hungerRestore?: number;
  happinessBoost?: number;
}

const ITEMS: SeedItem[] = [
  // ---- Food ----
  {
    slug: "sunberry-cluster",
    name: "Sunberry Cluster",
    description: "A handful of sweet golden berries picked at first light.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["sweet", "foraged"],
    price: 12,
    rarity: Rarity.COMMON,
    hungerRestore: 15,
  },
  {
    slug: "honey-oat-loaf",
    name: "Honey Oat Loaf",
    description: "A dense little loaf baked with grove honey and rolled oats.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["baked", "sweet"],
    price: 25,
    rarity: Rarity.COMMON,
    hungerRestore: 30,
  },
  {
    slug: "crispleaf-salad",
    name: "Crispleaf Salad",
    description: "Crunchy greens tossed with dewdrops and seed sprinkles.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["foraged"],
    price: 18,
    rarity: Rarity.COMMON,
    hungerRestore: 20,
  },
  {
    slug: "river-melon-slice",
    name: "River Melon Slice",
    description: "A juicy wedge of melon chilled in a cold stream.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["river", "sweet"],
    price: 20,
    rarity: Rarity.COMMON,
    hungerRestore: 25,
  },
  {
    slug: "acorn-tea",
    name: "Acorn Tea",
    description:
      "Steeped until it tastes reassuringly of autumn. Serves one, slowly.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["foraged", "woodland"],
    price: 8,
    rarity: Rarity.COMMON,
    hungerRestore: 10,
  },
  {
    slug: "riverweed-crisps",
    name: "Riverweed Crisps",
    description: "Salted, dried, and louder than any snack needs to be.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["river"],
    price: 14,
    rarity: Rarity.COMMON,
    hungerRestore: 15,
  },
  {
    slug: "toasted-nutcake",
    name: "Toasted Nutcake",
    description: "A hearty cake of ground nuts, toasted until golden.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["baked", "woodland"],
    price: 35,
    rarity: Rarity.UNCOMMON,
    hungerRestore: 40,
  },
  {
    slug: "mossberry-jam",
    name: "Mossberry Jam",
    description:
      "The recipe is a village secret, in the sense that the whole village knows it.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["sweet", "foraged"],
    price: 55,
    rarity: Rarity.UNCOMMON,
    hungerRestore: 35,
  },
  {
    slug: "drizzle-cake",
    name: "Drizzle Cake",
    description:
      "Baked only on mornings when the rain is exactly the right kind.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["baked", "sweet"],
    price: 150,
    rarity: Rarity.RARE,
    hungerRestore: 60,
  },
  // ---- Toys ----
  {
    slug: "bounce-burr",
    name: "Bounce Burr",
    description: "A springy seed pod that bounces in unpredictable directions.",
    type: ItemType.TOY,
    category: "toys",
    tags: ["foraged", "woodland"],
    price: 30,
    rarity: Rarity.COMMON,
    happinessBoost: 15,
  },
  {
    slug: "whistle-feather",
    name: "Whistle Feather",
    description: "A striped feather that whistles gently when waved about.",
    type: ItemType.TOY,
    category: "toys",
    tags: ["woodland"],
    price: 22,
    rarity: Rarity.UNCOMMON,
    happinessBoost: 10,
  },
  {
    slug: "puzzle-pebbles",
    name: "Puzzle Pebbles",
    description: "Smooth stacking stones that click satisfyingly into place.",
    type: ItemType.TOY,
    category: "toys",
    tags: ["river"],
    price: 45,
    rarity: Rarity.UNCOMMON,
    happinessBoost: 20,
  },
  {
    slug: "tumble-top",
    name: "Tumble Top",
    description:
      "Spins beautifully, falls over dramatically. Pets applaud both parts.",
    type: ItemType.TOY,
    category: "toys",
    tags: ["woodland", "keepsake"],
    price: 60,
    rarity: Rarity.UNCOMMON,
    happinessBoost: 18,
  },
  {
    slug: "patchwork-kite",
    name: "Patchwork Kite",
    description:
      "Sewn from forty-one scraps, none of which match, all of which fly.",
    type: ItemType.TOY,
    category: "toys",
    tags: ["keepsake"],
    price: 260,
    rarity: Rarity.RARE,
    happinessBoost: 30,
  },
  // ---- Curios ----
  {
    slug: "unremarkable-acorn",
    name: "Unremarkable Acorn",
    description: "An acorn of no particular consequence. It disagrees.",
    type: null,
    category: "curios",
    tags: ["foraged", "woodland"],
    price: 5,
    rarity: Rarity.COMMON,
  },
  {
    slug: "river-glass-pebble",
    name: "River-Glass Pebble",
    description:
      "Smoothed by years of patient water. Looks best held up to the light.",
    type: null,
    category: "curios",
    tags: ["river", "keepsake"],
    price: 14,
    rarity: Rarity.UNCOMMON,
  },
  {
    slug: "pressed-fern-frond",
    name: "Pressed Fern Frond",
    description: "A fern flattened between the pages of somebody's ledger.",
    type: null,
    category: "curios",
    tags: ["foraged", "keepsake"],
    price: 9,
    rarity: Rarity.COMMON,
  },
  {
    slug: "echo-shell",
    name: "Echo Shell",
    description:
      "Hold it to your ear and hear the river. Hold it further away and hear nothing, which is also the river.",
    type: null,
    category: "curios",
    tags: ["river", "keepsake"],
    price: 220,
    rarity: Rarity.RARE,
  },
  {
    slug: "sunshower-vial",
    name: "Sunshower Vial",
    description:
      "Rain that fell while the sun was out, bottled before it could decide which it was.",
    type: null,
    category: "curios",
    tags: ["keepsake"],
    price: 90,
    rarity: Rarity.UNCOMMON,
  },
  {
    slug: "gilded-acorn",
    name: "Gilded Acorn",
    description:
      "Somebody gilded an acorn. Nobody has explained why, and at this price nobody asks.",
    type: null,
    category: "curios",
    tags: ["woodland", "keepsake"],
    price: 1200,
    rarity: Rarity.ULTRA_RARE,
  },
  // Instanced items — one per provenance policy beyond NONE.
  {
    slug: "fernlight-lantern",
    name: "Fernlight Lantern",
    description:
      "Glows a soft green without fuel, flame, or explanation. Each one is numbered by the maker.",
    type: null,
    category: "curios",
    tags: ["woodland", "keepsake"],
    price: 400,
    rarity: Rarity.RARE,
    stackable: false,
    provenancePolicy: ProvenancePolicy.ORIGINAL_SOURCE,
  },
  {
    slug: "grovewardens-compass",
    name: "Grovewarden's Compass",
    description:
      "Points somewhere important. Previous owners have disagreed, at length, about where.",
    type: null,
    category: "curios",
    tags: ["keepsake"],
    price: 2500,
    rarity: Rarity.ULTRA_RARE,
    stackable: false,
    provenancePolicy: ProvenancePolicy.FULL_HISTORY,
  },
  // Nontradeable keepsake.
  {
    slug: "wanderers-first-map",
    name: "Wanderer's First Map",
    description:
      "The map every wanderer starts with. Slightly wrong in ways you will come to treasure.",
    type: null,
    category: "curios",
    tags: ["keepsake"],
    price: 5,
    rarity: Rarity.COMMON,
    tradeable: false,
  },
];

// Placeholder world content — names and copy are deliberately provisional
// and safe to replace before the final world identity is decided.
const REGIONS = [
  {
    slug: "dapplewood",
    name: "Dapplewood",
    description:
      "A wood of shifting light and unhurried paths. Nothing here is in a rush, including the residents.",
    artKey: "dapplewood",
    sortOrder: 0,
    published: true,
    locations: [
      {
        slug: "mosslight-clearing",
        name: "Mosslight Clearing",
        description:
          "A round green clearing where the moss glows faintly after rain. Popular with pets, picnickers, and one extremely territorial squirrel.",
        artKey: "mosslight-clearing",
        sortOrder: 0,
        published: true,
        mapX: 30,
        mapY: 38,
      },
      {
        slug: "old-footbridge",
        name: "The Old Footbridge",
        description:
          "A stone bridge over slow water. Leaning on the rail and watching the river is considered a complete activity here.",
        artKey: "old-footbridge",
        sortOrder: 1,
        published: true,
        mapX: 64,
        mapY: 56,
      },
      {
        slug: "toadstool-hollow",
        name: "Toadstool Hollow",
        description:
          "A dim, cosy dell crowded with mushrooms of respectable size and questionable opinions.",
        artKey: "toadstool-hollow",
        sortOrder: 2,
        published: true,
        mapX: 44,
        mapY: 74,
      },
      {
        slug: "the-mossy-market",
        name: "The Mossy Market",
        description:
          "A hollow log fitted with shelves, a counter, and opinions about correct change.",
        artKey: "the-mossy-market",
        sortOrder: 3,
        published: true,
        mapX: 72,
        mapY: 28,
      },
      {
        slug: "the-listening-stump",
        name: "The Listening Stump",
        description:
          "An enormous old stump. It is said to listen. It has never once been heard to reply.",
        artKey: "the-listening-stump",
        sortOrder: 4,
        published: false,
        mapX: 18,
        mapY: 82,
      },
    ],
  },
] as const;

interface SeedPoolEntry {
  item: string;
  shopRarity: Rarity;
  price: number;
  weight: number;
  minQuantity: number;
  maxQuantity: number;
  availableUntil?: Date;
}

interface SeedNpcShop {
  slug: string;
  locationSlug: string;
  name: string;
  description: string;
  keeperCopy: string;
  keeperArtKey?: string;
  artKey?: string;
  /** Restock config; omitted fields use the documented defaults. */
  config: Partial<{
    intervalHours: number;
    targetListings: number;
    commonMin: number;
    commonMax: number;
    uncommonMin: number;
    uncommonMax: number;
    rareMin: number;
    rareMax: number;
    ultraRareBps: number;
    maxUltraRare: number;
  }>;
  pool: SeedPoolEntry[];
}

const NPC_SHOPS: SeedNpcShop[] = [
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
      { item: "sunberry-cluster", shopRarity: Rarity.COMMON, price: 12, weight: 100, minQuantity: 6, maxQuantity: 14 },
      { item: "honey-oat-loaf", shopRarity: Rarity.COMMON, price: 25, weight: 80, minQuantity: 4, maxQuantity: 10 },
      { item: "crispleaf-salad", shopRarity: Rarity.COMMON, price: 18, weight: 90, minQuantity: 5, maxQuantity: 12 },
      { item: "river-melon-slice", shopRarity: Rarity.COMMON, price: 20, weight: 85, minQuantity: 4, maxQuantity: 10 },
      { item: "acorn-tea", shopRarity: Rarity.COMMON, price: 8, weight: 110, minQuantity: 8, maxQuantity: 16 },
      { item: "riverweed-crisps", shopRarity: Rarity.COMMON, price: 14, weight: 95, minQuantity: 6, maxQuantity: 12 },
      { item: "bounce-burr", shopRarity: Rarity.COMMON, price: 30, weight: 70, minQuantity: 3, maxQuantity: 8 },
      { item: "unremarkable-acorn", shopRarity: Rarity.COMMON, price: 5, weight: 120, minQuantity: 10, maxQuantity: 20 },
      { item: "pressed-fern-frond", shopRarity: Rarity.COMMON, price: 9, weight: 75, minQuantity: 5, maxQuantity: 10 },
      // Uncommons
      { item: "toasted-nutcake", shopRarity: Rarity.UNCOMMON, price: 35, weight: 60, minQuantity: 2, maxQuantity: 6 },
      { item: "whistle-feather", shopRarity: Rarity.UNCOMMON, price: 22, weight: 55, minQuantity: 2, maxQuantity: 5 },
      { item: "puzzle-pebbles", shopRarity: Rarity.UNCOMMON, price: 45, weight: 50, minQuantity: 2, maxQuantity: 5 },
      { item: "mossberry-jam", shopRarity: Rarity.UNCOMMON, price: 55, weight: 45, minQuantity: 1, maxQuantity: 4 },
      { item: "tumble-top", shopRarity: Rarity.UNCOMMON, price: 60, weight: 40, minQuantity: 1, maxQuantity: 3 },
      // Date-limited pool entry (explicit availability window, not a season
      // system): available until the end of 2026.
      {
        item: "sunshower-vial",
        shopRarity: Rarity.UNCOMMON,
        price: 90,
        weight: 30,
        minQuantity: 1,
        maxQuantity: 2,
        availableUntil: new Date("2027-01-01T00:00:00Z"),
      },
      // Rares
      { item: "drizzle-cake", shopRarity: Rarity.RARE, price: 150, weight: 40, minQuantity: 1, maxQuantity: 3 },
      { item: "echo-shell", shopRarity: Rarity.RARE, price: 220, weight: 30, minQuantity: 1, maxQuantity: 2 },
      { item: "patchwork-kite", shopRarity: Rarity.RARE, price: 260, weight: 25, minQuantity: 1, maxQuantity: 2 },
      // Ultra-rare
      { item: "gilded-acorn", shopRarity: Rarity.ULTRA_RARE, price: 1200, weight: 10, minQuantity: 1, maxQuantity: 1 },
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
      intervalHours: 6,
      targetListings: 8,
      commonMin: 5,
      commonMax: 6,
      uncommonMin: 1,
      uncommonMax: 2,
      rareMin: 0,
      rareMax: 1,
    },
    pool: [
      { item: "acorn-tea", shopRarity: Rarity.COMMON, price: 10, weight: 100, minQuantity: 5, maxQuantity: 12 },
      { item: "crispleaf-salad", shopRarity: Rarity.COMMON, price: 20, weight: 80, minQuantity: 4, maxQuantity: 8 },
      { item: "pressed-fern-frond", shopRarity: Rarity.COMMON, price: 9, weight: 90, minQuantity: 4, maxQuantity: 10 },
      { item: "riverweed-crisps", shopRarity: Rarity.COMMON, price: 16, weight: 85, minQuantity: 4, maxQuantity: 10 },
      { item: "unremarkable-acorn", shopRarity: Rarity.COMMON, price: 6, weight: 110, minQuantity: 8, maxQuantity: 16 },
      { item: "sunberry-cluster", shopRarity: Rarity.COMMON, price: 13, weight: 95, minQuantity: 5, maxQuantity: 10 },
      { item: "mossberry-jam", shopRarity: Rarity.UNCOMMON, price: 60, weight: 50, minQuantity: 1, maxQuantity: 3 },
      { item: "sunshower-vial", shopRarity: Rarity.UNCOMMON, price: 85, weight: 40, minQuantity: 1, maxQuantity: 2 },
      // Shop-specific rarity differs from the item's general rarity
      // (river-glass-pebble is generally UNCOMMON; rare here).
      { item: "river-glass-pebble", shopRarity: Rarity.RARE, price: 40, weight: 35, minQuantity: 1, maxQuantity: 2 },
      // An instanced item sold by an NPC shop.
      { item: "fernlight-lantern", shopRarity: Rarity.RARE, price: 400, weight: 20, minQuantity: 1, maxQuantity: 1 },
      { item: "grovewardens-compass", shopRarity: Rarity.ULTRA_RARE, price: 2500, weight: 10, minQuantity: 1, maxQuantity: 1 },
    ],
  },
];

const UPGRADE_TIERS = [
  { tier: 1, name: "A Second Shelf", price: 500, capacityBonus: 4 },
  { tier: 2, name: "The Back Room", price: 2000, capacityBonus: 4 },
  { tier: 3, name: "A Proper Counter", price: 8000, capacityBonus: 6 },
  { tier: 4, name: "The Loft Extension", price: 25000, capacityBonus: 6 },
] as const;

async function main(): Promise<void> {
  for (const species of SPECIES) {
    await prisma.petSpecies.upsert({
      where: { slug: species.slug },
      create: species,
      update: species,
    });
  }

  for (const category of CATEGORIES) {
    await prisma.itemCategory.upsert({
      where: { slug: category.slug },
      create: category,
      update: category,
    });
  }

  for (const tag of TAGS) {
    await prisma.itemTag.upsert({
      where: { slug: tag.slug },
      create: tag,
      update: tag,
    });
  }

  for (const item of ITEMS) {
    const { category, tags, ...fields } = item;
    const data = {
      ...fields,
      artKey: item.slug,
      tradeable: item.tradeable ?? true,
      stackable: item.stackable ?? true,
      provenancePolicy: item.provenancePolicy ?? ProvenancePolicy.NONE,
      hungerRestore: item.hungerRestore ?? null,
      happinessBoost: item.happinessBoost ?? null,
      category: { connect: { slug: category } },
    };
    const tagRefs = tags.map((slug) => ({ slug }));
    await prisma.item.upsert({
      where: { slug: item.slug },
      create: { ...data, tags: { connect: tagRefs } },
      update: { ...data, tags: { set: tagRefs } },
    });
  }

  for (const region of REGIONS) {
    const { locations, ...regionFields } = region;
    const dbRegion = await prisma.region.upsert({
      where: { slug: region.slug },
      create: regionFields,
      update: regionFields,
    });
    for (const location of locations) {
      await prisma.location.upsert({
        where: { slug: location.slug },
        create: { ...location, regionId: dbRegion.id },
        update: { ...location, regionId: dbRegion.id },
      });
    }
  }

  for (const shop of NPC_SHOPS) {
    const location = await prisma.location.findUniqueOrThrow({
      where: { slug: shop.locationSlug },
    });
    const shopData = {
      name: shop.name,
      description: shop.description,
      keeperCopy: shop.keeperCopy,
      keeperArtKey: shop.keeperArtKey ?? null,
      artKey: shop.artKey ?? null,
      locationId: location.id,
    };
    const dbShop = await prisma.npcShop.upsert({
      where: { slug: shop.slug },
      create: { slug: shop.slug, ...shopData },
      update: shopData,
    });
    await prisma.npcShopRestockConfig.upsert({
      where: { shopId: dbShop.id },
      create: { shopId: dbShop.id, ...shop.config },
      update: shop.config,
    });
    for (const entry of shop.pool) {
      const item = await prisma.item.findUniqueOrThrow({
        where: { slug: entry.item },
      });
      const entryData = {
        shopRarity: entry.shopRarity,
        price: entry.price,
        weight: entry.weight,
        minQuantity: entry.minQuantity,
        maxQuantity: entry.maxQuantity,
        availableUntil: entry.availableUntil ?? null,
      };
      await prisma.npcShopPoolEntry.upsert({
        where: { shopId_itemId: { shopId: dbShop.id, itemId: item.id } },
        create: { shopId: dbShop.id, itemId: item.id, ...entryData },
        update: entryData,
      });
    }
  }

  for (const tier of UPGRADE_TIERS) {
    await prisma.playerShopUpgradeTier.upsert({
      where: { tier: tier.tier },
      create: tier,
      update: tier,
    });
  }

  const counts = {
    species: await prisma.petSpecies.count(),
    categories: await prisma.itemCategory.count(),
    tags: await prisma.itemTag.count(),
    items: await prisma.item.count(),
    regions: await prisma.region.count(),
    locations: await prisma.location.count(),
    npcShops: await prisma.npcShop.count(),
    poolEntries: await prisma.npcShopPoolEntry.count(),
    upgradeTiers: await prisma.playerShopUpgradeTier.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
