import type {
  Item,
  ItemLifecycle,
  ItemType,
  PrismaClient,
  ProvenancePolicy,
  Rarity,
} from "@prisma/client";

export async function createTestItem(
  db: PrismaClient,
  {
    slug,
    name = slug,
    type = null,
    rarity = "COMMON",
    lifecycle = "ACTIVE",
    tradeable = true,
    stackable = true,
    provenancePolicy = "NONE",
    price = 10n,
    hungerRestore = null,
    happinessBoost = null,
  }: {
    slug: string;
    name?: string;
    type?: ItemType | null;
    rarity?: Rarity;
    lifecycle?: ItemLifecycle;
    tradeable?: boolean;
    stackable?: boolean;
    provenancePolicy?: ProvenancePolicy;
    price?: bigint;
    hungerRestore?: number | null;
    happinessBoost?: number | null;
  },
): Promise<Item> {
  return db.item.create({
    data: {
      slug,
      name,
      description: "Test fixture",
      type,
      artKey: slug,
      price,
      rarity,
      lifecycle,
      tradeable,
      stackable,
      provenancePolicy,
      hungerRestore,
      happinessBoost,
    },
  });
}

export async function giveStack(
  db: PrismaClient,
  { userId, itemId, quantity }: { userId: string; itemId: string; quantity: number },
): Promise<void> {
  await db.inventoryEntry.upsert({
    where: { userId_itemId: { userId, itemId } },
    create: { userId, itemId, quantity },
    update: { quantity },
  });
}

export async function cleanupTestItems(
  db: PrismaClient,
  slugPrefix: string,
): Promise<void> {
  await db.itemProvenanceEvent.deleteMany({
    where: { itemInstance: { item: { slug: { startsWith: slugPrefix } } } },
  });
  await db.itemInstance.deleteMany({
    where: { item: { slug: { startsWith: slugPrefix } } },
  });
  await db.item.deleteMany({ where: { slug: { startsWith: slugPrefix } } });
}
