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

const ITEMS = [
  // Food
  {
    slug: "sunberry-cluster",
    name: "Sunberry Cluster",
    description: "A handful of sweet golden berries picked at first light.",
    type: ItemType.FOOD,
    price: 12,
    hungerRestore: 15,
  },
  {
    slug: "honey-oat-loaf",
    name: "Honey Oat Loaf",
    description: "A dense little loaf baked with grove honey and rolled oats.",
    type: ItemType.FOOD,
    price: 25,
    hungerRestore: 30,
  },
  {
    slug: "crispleaf-salad",
    name: "Crispleaf Salad",
    description: "Crunchy greens tossed with dewdrops and seed sprinkles.",
    type: ItemType.FOOD,
    price: 18,
    hungerRestore: 20,
  },
  {
    slug: "river-melon-slice",
    name: "River Melon Slice",
    description: "A juicy wedge of melon chilled in a cold stream.",
    type: ItemType.FOOD,
    price: 20,
    hungerRestore: 25,
  },
  {
    slug: "toasted-nutcake",
    name: "Toasted Nutcake",
    description: "A hearty cake of ground nuts, toasted until golden.",
    type: ItemType.FOOD,
    price: 35,
    hungerRestore: 40,
  },
  // Toys
  {
    slug: "bounce-burr",
    name: "Bounce Burr",
    description: "A springy seed pod that bounces in unpredictable directions.",
    type: ItemType.TOY,
    price: 30,
    happinessBoost: 15,
  },
  {
    slug: "whistle-feather",
    name: "Whistle Feather",
    description: "A striped feather that whistles gently when waved about.",
    type: ItemType.TOY,
    price: 22,
    happinessBoost: 10,
  },
  {
    slug: "puzzle-pebbles",
    name: "Puzzle Pebbles",
    description: "Smooth stacking stones that click satisfyingly into place.",
    type: ItemType.TOY,
    price: 45,
    happinessBoost: 20,
  },
] as const;

const SHOP = {
  slug: "mossy-market",
  name: "The Mossy Market",
  description:
    "The grove's one-stop stall for snacks and playthings, run from a hollow log.",
} as const;

async function main(): Promise<void> {
  for (const species of SPECIES) {
    await prisma.petSpecies.upsert({
      where: { slug: species.slug },
      create: species,
      update: species,
    });
  }

  for (const item of ITEMS) {
    await prisma.item.upsert({
      where: { slug: item.slug },
      create: item,
      update: item,
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

  const counts = {
    species: await prisma.petSpecies.count(),
    items: await prisma.item.count(),
    shops: await prisma.shop.count(),
    listings: await prisma.shopListing.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
