import { PrismaClient, ItemType } from "@prisma/client";

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
  tradeable?: boolean;
  hungerRestore?: number;
  happinessBoost?: number;
}

const ITEMS: SeedItem[] = [
  // Food
  {
    slug: "sunberry-cluster",
    name: "Sunberry Cluster",
    description: "A handful of sweet golden berries picked at first light.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["sweet", "foraged"],
    price: 12,
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
    hungerRestore: 25,
  },
  {
    slug: "toasted-nutcake",
    name: "Toasted Nutcake",
    description: "A hearty cake of ground nuts, toasted until golden.",
    type: ItemType.FOOD,
    category: "food",
    tags: ["baked", "woodland"],
    price: 35,
    hungerRestore: 40,
  },
  // Toys
  {
    slug: "bounce-burr",
    name: "Bounce Burr",
    description: "A springy seed pod that bounces in unpredictable directions.",
    type: ItemType.TOY,
    category: "toys",
    tags: ["foraged", "woodland"],
    price: 30,
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
    happinessBoost: 20,
  },
  // Curios — prove the model supports possessions with no use effect.
  {
    slug: "unremarkable-acorn",
    name: "Unremarkable Acorn",
    description: "An acorn of no particular consequence. It disagrees.",
    type: null,
    category: "curios",
    tags: ["foraged", "woodland"],
    price: 5,
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
  },
  {
    slug: "pressed-fern-frond",
    name: "Pressed Fern Frond",
    description: "A fern flattened between the pages of somebody's ledger.",
    type: null,
    category: "curios",
    tags: ["foraged", "keepsake"],
    price: 9,
  },
];

const SHOP = {
  slug: "mossy-market",
  name: "The Mossy Market",
  description:
    "The grove's one-stop stall for snacks and playthings, run from a hollow log.",
} as const;

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
      },
      {
        slug: "old-footbridge",
        name: "The Old Footbridge",
        description:
          "A stone bridge over slow water. Leaning on the rail and watching the river is considered a complete activity here.",
        artKey: "old-footbridge",
        sortOrder: 1,
        published: true,
      },
      {
        slug: "toadstool-hollow",
        name: "Toadstool Hollow",
        description:
          "A dim, cosy dell crowded with mushrooms of respectable size and questionable opinions.",
        artKey: "toadstool-hollow",
        sortOrder: 2,
        published: true,
      },
      {
        slug: "the-listening-stump",
        name: "The Listening Stump",
        description:
          "An enormous old stump. It is said to listen. It has never once been heard to reply.",
        artKey: "the-listening-stump",
        sortOrder: 3,
        published: false,
      },
    ],
  },
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

  const shop = await prisma.shop.upsert({
    where: { slug: SHOP.slug },
    create: SHOP,
    update: SHOP,
  });

  for (const item of ITEMS) {
    const dbItem = await prisma.item.findUniqueOrThrow({
      where: { slug: item.slug },
    });
    await prisma.shopListing.upsert({
      where: { shopId_itemId: { shopId: shop.id, itemId: dbItem.id } },
      create: { shopId: shop.id, itemId: dbItem.id, price: item.price },
      update: { price: item.price },
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

  const counts = {
    species: await prisma.petSpecies.count(),
    categories: await prisma.itemCategory.count(),
    tags: await prisma.itemTag.count(),
    items: await prisma.item.count(),
    shops: await prisma.shop.count(),
    listings: await prisma.shopListing.count(),
    regions: await prisma.region.count(),
    locations: await prisma.location.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
