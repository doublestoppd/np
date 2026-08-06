import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PrismaClient,
  ItemType,
  Rarity,
  ProvenancePolicy,
  WheelPoolType,
  WheelResultType,
} from "@prisma/client";
import {
  importAnswerWords,
  importGuessWords,
} from "../src/server/modules/daily/word/words";

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

  // ---- Daily community meal foods (Hearth and Ladle) ----
  {
    slug: "honey-oat-biscuit",
    name: "Honey-Oat Biscuit",
    description: "Firm enough for travel and, regrettably, conversation.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["baked", "sweet"],
    price: 10,
    rarity: Rarity.COMMON,
    hungerRestore: 15,
  },
  {
    slug: "mushroom-hand-pie",
    name: "Mushroom Hand Pie",
    description: "The mushroom declined to comment.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["baked", "woodland"],
    price: 16,
    rarity: Rarity.COMMON,
    hungerRestore: 25,
  },
  {
    slug: "berry-jam-toast",
    name: "Berry Jam Toast",
    description: "Mostly jam. The toast is serving a structural role.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["baked", "sweet"],
    price: 12,
    rarity: Rarity.COMMON,
    hungerRestore: 18,
  },
  {
    slug: "apple-clover-tart",
    name: "Apple-Clover Tart",
    description: "Four leaves were considered excessive.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["baked", "foraged"],
    price: 14,
    rarity: Rarity.COMMON,
    hungerRestore: 20,
  },
  {
    slug: "warm-root-stew",
    name: "Warm Root Stew",
    description: "Its ingredients are best described as subterranean.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["foraged", "woodland"],
    price: 18,
    rarity: Rarity.COMMON,
    hungerRestore: 30,
  },
  {
    slug: "cloudberry-muffin",
    name: "Cloudberry Muffin",
    description: "Contains berries. Cloud content remains disputed.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["baked", "sweet"],
    price: 13,
    rarity: Rarity.COMMON,
    hungerRestore: 18,
  },
  {
    slug: "herb-flecked-bread",
    name: "Herb-Flecked Bread",
    description: "Every fleck has been accounted for.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["baked", "foraged"],
    price: 11,
    rarity: Rarity.COMMON,
    hungerRestore: 16,
  },
  {
    slug: "roasted-mooncarrot",
    name: "Roasted Mooncarrot",
    description: "Not from the moon. Marketing prevailed.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["foraged"],
    price: 9,
    rarity: Rarity.COMMON,
    hungerRestore: 14,
  },
  {
    slug: "pear-and-thyme-scone",
    name: "Pear and Thyme Scone",
    description: "Available today, and also thyme.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["baked", "sweet"],
    price: 13,
    rarity: Rarity.COMMON,
    hungerRestore: 18,
  },
  {
    slug: "cinnamon-moss-cake",
    name: "Cinnamon Moss Cake",
    description: "The moss is decorative. Probably.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["baked", "sweet", "woodland"],
    price: 15,
    rarity: Rarity.COMMON,
    hungerRestore: 22,
  },

  // ---- Prize wheel curiosities (Brassbell Pavilion) ----
  {
    slug: "dewdrop-vial",
    name: "Dewdrop Vial",
    description: "A stoppered vial of morning dew, collected before it noticed.",
    type: null,
    category: "curios",
    tags: ["keepsake", "foraged"],
    price: 20,
    rarity: Rarity.COMMON,
  },
  {
    slug: "patchwork-ribbon",
    name: "Patchwork Ribbon",
    description: "Seven fabrics, one ribbon, zero matching opinions.",
    type: null,
    category: "curios",
    tags: ["keepsake"],
    price: 15,
    rarity: Rarity.COMMON,
  },
  {
    slug: "mossy-brass-button",
    name: "Mossy Brass Button",
    description: "Lost from a very fine coat, found by very patient moss.",
    type: null,
    category: "curios",
    tags: ["keepsake", "woodland"],
    price: 18,
    rarity: Rarity.COMMON,
  },
  {
    slug: "painted-river-pebble",
    name: "Painted River Pebble",
    description: "Painted by hand, smoothed by river, judged by no one.",
    type: null,
    category: "curios",
    tags: ["keepsake", "river"],
    price: 12,
    rarity: Rarity.COMMON,
  },
  {
    slug: "tiny-copper-bell",
    name: "Tiny Copper Bell",
    description: "Rings a note so small it is mostly a suggestion.",
    type: null,
    category: "curios",
    tags: ["keepsake"],
    price: 22,
    rarity: Rarity.COMMON,
  },
  {
    slug: "woven-fern-bookmark",
    name: "Woven Fern Bookmark",
    description: "Keeps your place. Withholds all spoilers.",
    type: null,
    category: "curios",
    tags: ["keepsake", "woodland"],
    price: 16,
    rarity: Rarity.COMMON,
  },
  {
    slug: "starroot-brooch",
    name: "Starroot Brooch",
    description:
      "Carved from a root that grew stubbornly toward the night sky.",
    type: null,
    category: "curios",
    tags: ["keepsake", "woodland"],
    price: 600,
    rarity: Rarity.RARE,
    stackable: false,
    provenancePolicy: ProvenancePolicy.FULL_HISTORY,
  },
  {
    slug: "moonglass-teacup",
    name: "Moonglass Teacup",
    description: "Holds tea, moonlight, and exactly one polite secret.",
    type: null,
    category: "curios",
    tags: ["keepsake"],
    price: 550,
    rarity: Rarity.RARE,
    stackable: false,
    provenancePolicy: ProvenancePolicy.FULL_HISTORY,
  },
  {
    slug: "whispering-compass",
    name: "Whispering Compass",
    description:
      "Points wherever you were already going, and murmurs approval.",
    type: null,
    category: "curios",
    tags: ["keepsake"],
    price: 700,
    rarity: Rarity.RARE,
    stackable: false,
    provenancePolicy: ProvenancePolicy.FULL_HISTORY,
  },
  {
    slug: "glasswing-music-box",
    name: "Glasswing Music Box",
    description: "Plays a tune remembered from a dream nobody admits to.",
    type: null,
    category: "curios",
    tags: ["keepsake"],
    price: 800,
    rarity: Rarity.RARE,
    stackable: false,
    provenancePolicy: ProvenancePolicy.FULL_HISTORY,
  },
  {
    slug: "crown-of-quiet-lanterns",
    name: "Crown of Quiet Lanterns",
    description: "Six tiny lanterns that light only when nobody is looking.",
    type: null,
    category: "curios",
    tags: ["keepsake"],
    price: 900,
    rarity: Rarity.RARE,
    stackable: false,
    provenancePolicy: ProvenancePolicy.FULL_HISTORY,
  },
  {
    slug: "silvercloud-keepsake",
    name: "Silvercloud Keepsake",
    description:
      "A pocket of captured drizzle from a cloud with sentimental value.",
    type: null,
    category: "curios",
    tags: ["keepsake", "river"],
    price: 650,
    rarity: Rarity.RARE,
    stackable: false,
    provenancePolicy: ProvenancePolicy.FULL_HISTORY,
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
      // Daily-activity locations (src/server/modules/daily/locations.ts).
      {
        slug: "whisperleaf-reading-room",
        name: "Whisperleaf Reading Room",
        description:
          "The librarian has hidden today's words in plain sight. This is considered educational.",
        artKey: "whisperleaf-reading-room",
        sortOrder: 5,
        published: true,
        mapX: 14,
        mapY: 24,
      },
      {
        slug: "brassbell-pavilion",
        name: "Brassbell Pavilion",
        description:
          "The wheel has been inspected for fairness by someone who owns the wheel.",
        artKey: "brassbell-pavilion",
        sortOrder: 6,
        published: true,
        mapX: 52,
        mapY: 16,
      },
      {
        slug: "hearth-and-ladle",
        name: "Hearth and Ladle",
        description:
          "One complimentary meal per visitor. Seconds remain a philosophical question.",
        artKey: "hearth-and-ladle",
        sortOrder: 7,
        published: true,
        mapX: 84,
        mapY: 66,
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
    intervalMinutes: number;
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

// ---------------------------------------------------------------------------
// Daily activities (Phase 4)
// ---------------------------------------------------------------------------

/**
 * Curated answer pools — every word content-reviewed: common, friendly,
 * no proper nouns, abbreviations, or moderation risks. The broad
 * accepted-guess dictionary is imported separately from
 * prisma/data/accepted-words.txt through the validated pipeline.
 */
const WORD_ANSWERS = [
  // 4 letters (EASY)
  "MOSS", "FERN", "GLOW", "MIST", "WISP", "BARK",
  "STAR", "CAVE", "POND", "TOAD", "RUNE", "DUSK",
  // 5 letters (MEDIUM)
  "BRIAR", "GLADE", "CHARM", "HONEY", "RIVER", "BLOOM",
  "LIGHT", "SPARK", "PEARL", "CLOUD", "STONE", "GROVE",
  // 6 letters (HARD)
  "FOREST", "MEADOW", "WILLOW", "GARDEN", "SPIRIT", "EMBERS",
  "BREEZE", "ACORNS", "PETALS", "CANDLE", "FABLES", "VELVET",
];

const WHEEL_POOLS = [
  {
    slug: "brassbell-common-curiosities",
    poolType: WheelPoolType.COMMON,
    entries: [
      { item: "dewdrop-vial", weight: 100 },
      { item: "patchwork-ribbon", weight: 100 },
      { item: "mossy-brass-button", weight: 100 },
      { item: "painted-river-pebble", weight: 100 },
      { item: "tiny-copper-bell", weight: 80 },
      { item: "woven-fern-bookmark", weight: 80 },
    ],
  },
  {
    slug: "brassbell-rare-curiosities",
    poolType: WheelPoolType.RARE,
    entries: [
      { item: "starroot-brooch", weight: 100 },
      { item: "moonglass-teacup", weight: 100 },
      { item: "whispering-compass", weight: 80 },
      { item: "glasswing-music-box", weight: 60 },
      { item: "crown-of-quiet-lanterns", weight: 40 },
      { item: "silvercloud-keepsake", weight: 80 },
    ],
  },
] as const;

const NOTHING_FLAVOR_LINES = [
  "The wheel has awarded you a valuable lesson in probability.",
  "Nothing. It was very neatly wrapped.",
  "The pointer stopped between optimism and accounting.",
  "You receive the rare privilege of trying again tomorrow.",
  "The wheel insists this outcome builds character.",
].join("\n");

/**
 * Prize weights are basis points and must sum to 10000. Recorded spins
 * reference this configuration version forever, so weight changes go into
 * a NEW version (bump `version`, set the old one inactive) — never edits
 * to a version that has spins.
 */
const WHEEL_CONFIGURATION = {
  wheelSlug: "brassbell-wheel",
  wheelName: "The Brassbell Wheel",
  version: 1,
  prizes: [
    { label: "Nothing", icon: "🍃", resultType: WheelResultType.NOTHING, weight: 2000, displayOrder: 0, flavorText: NOTHING_FLAVOR_LINES },
    { label: "A Few Coins", icon: "🪙", resultType: WheelResultType.COINS, weight: 2800, coinAmount: 25, displayOrder: 1 },
    { label: "Pocket Change", icon: "👛", resultType: WheelResultType.COINS, weight: 2200, coinAmount: 50, displayOrder: 2 },
    { label: "A Respectable Sum", icon: "💰", resultType: WheelResultType.COINS, weight: 1200, coinAmount: 100, displayOrder: 3 },
    { label: "A Shiny Pile", icon: "✨", resultType: WheelResultType.COINS, weight: 500, coinAmount: 250, displayOrder: 4 },
    { label: "Jackpot", icon: "👑", resultType: WheelResultType.COINS, weight: 100, coinAmount: 500, displayOrder: 5 },
    { label: "Common Curiosity", icon: "🎁", resultType: WheelResultType.ITEM_POOL, weight: 1000, pool: "brassbell-common-curiosities", displayOrder: 6 },
    { label: "Rare Curiosity", icon: "💎", resultType: WheelResultType.ITEM_POOL, weight: 200, pool: "brassbell-rare-curiosities", displayOrder: 7 },
  ],
} as const;

const FOOD_POOL = {
  slug: "hearth-and-ladle",
  entries: [
    { item: "honey-oat-biscuit", weight: 120 },
    { item: "mushroom-hand-pie", weight: 100 },
    { item: "berry-jam-toast", weight: 120 },
    { item: "apple-clover-tart", weight: 100 },
    { item: "warm-root-stew", weight: 80 },
    { item: "cloudberry-muffin", weight: 100 },
    { item: "herb-flecked-bread", weight: 120 },
    { item: "roasted-mooncarrot", weight: 120 },
    { item: "pear-and-thyme-scone", weight: 100 },
    { item: "cinnamon-moss-cake", weight: 80 },
  ],
} as const;

async function seedDailyActivities(): Promise<void> {
  // Word content: curated answers + the broad accepted-guess dictionary.
  const answers = await importAnswerWords(
    prisma,
    [...WORD_ANSWERS],
    "Curated Phase 4 seed answer — reviewed for tone and commonness",
  );
  const dictionaryPath = path.join(__dirname, "data", "accepted-words.txt");
  const dictionary = readFileSync(dictionaryPath, "utf8")
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const guesses = await importGuessWords(prisma, dictionary);
  if (answers.rejected.length > 0 || guesses.rejected.length > 0) {
    console.warn("Word import rejections:", {
      answers: answers.rejected,
      guesses: guesses.rejected.length,
    });
  }

  // Prize wheel: pools, wheel, and configuration v1. Prizes are only
  // created when their configuration version is new — existing versions
  // may already be referenced by recorded spins and never change.
  const poolIds = new Map<string, string>();
  for (const pool of WHEEL_POOLS) {
    const dbPool = await prisma.dailyWheelItemPool.upsert({
      where: { slug: pool.slug },
      create: { slug: pool.slug, poolType: pool.poolType },
      update: { poolType: pool.poolType },
    });
    poolIds.set(pool.slug, dbPool.id);
    for (const entry of pool.entries) {
      const item = await prisma.item.findUniqueOrThrow({
        where: { slug: entry.item },
      });
      await prisma.dailyWheelItemPoolEntry.upsert({
        where: { poolId_itemId: { poolId: dbPool.id, itemId: item.id } },
        create: {
          poolId: dbPool.id,
          itemId: item.id,
          selectionWeight: entry.weight,
        },
        update: { selectionWeight: entry.weight },
      });
    }
  }
  const wheel = await prisma.dailyWheel.upsert({
    where: { slug: WHEEL_CONFIGURATION.wheelSlug },
    create: {
      slug: WHEEL_CONFIGURATION.wheelSlug,
      name: WHEEL_CONFIGURATION.wheelName,
    },
    update: { name: WHEEL_CONFIGURATION.wheelName },
  });
  const existingConfig = await prisma.dailyWheelConfiguration.findUnique({
    where: {
      wheelId_version: {
        wheelId: wheel.id,
        version: WHEEL_CONFIGURATION.version,
      },
    },
  });
  if (!existingConfig) {
    const totalWeight = WHEEL_CONFIGURATION.prizes.reduce(
      (sum, prize) => sum + prize.weight,
      0,
    );
    if (totalWeight !== 10_000) {
      throw new Error(
        `Wheel prize weights must sum to 10000 basis points (got ${totalWeight})`,
      );
    }
    await prisma.dailyWheelConfiguration.create({
      data: {
        wheelId: wheel.id,
        version: WHEEL_CONFIGURATION.version,
        active: true,
        prizes: {
          create: WHEEL_CONFIGURATION.prizes.map((prize) => ({
            label: prize.label,
            icon: prize.icon,
            resultType: prize.resultType,
            weight: prize.weight,
            coinAmount: "coinAmount" in prize ? prize.coinAmount : null,
            itemPoolId:
              "pool" in prize ? (poolIds.get(prize.pool) ?? null) : null,
            displayOrder: prize.displayOrder,
            flavorText: "flavorText" in prize ? prize.flavorText : "",
          })),
        },
      },
    });
  } else {
    // Existing configuration versions never change economically (recorded
    // spins reference them), but presentation-only icons may be refreshed.
    for (const prize of WHEEL_CONFIGURATION.prizes) {
      await prisma.dailyWheelPrize.updateMany({
        where: { configurationId: existingConfig.id, label: prize.label },
        data: { icon: prize.icon },
      });
    }
  }

  // Community meal pool.
  const foodPool = await prisma.dailyFoodPool.upsert({
    where: { slug: FOOD_POOL.slug },
    create: { slug: FOOD_POOL.slug },
    update: {},
  });
  for (const entry of FOOD_POOL.entries) {
    const item = await prisma.item.findUniqueOrThrow({
      where: { slug: entry.item },
    });
    await prisma.dailyFoodPoolEntry.upsert({
      where: { poolId_itemId: { poolId: foodPool.id, itemId: item.id } },
      create: {
        poolId: foodPool.id,
        itemId: item.id,
        selectionWeight: entry.weight,
      },
      update: { selectionWeight: entry.weight },
    });
  }
}

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
        where: {
          regionId_slug: { regionId: dbRegion.id, slug: location.slug },
        },
        create: { ...location, regionId: dbRegion.id },
        update: { ...location, regionId: dbRegion.id },
      });
    }
  }

  for (const shop of NPC_SHOPS) {
    const location = await prisma.location.findFirstOrThrow({
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

  await seedDailyActivities();

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
    words: await prisma.wordEntry.count(),
    answerWords: await prisma.wordEntry.count({
      where: { eligibleAsAnswer: true },
    }),
    wheelPrizes: await prisma.dailyWheelPrize.count(),
    wheelPoolEntries: await prisma.dailyWheelItemPoolEntry.count(),
    foodPoolEntries: await prisma.dailyFoodPoolEntry.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
