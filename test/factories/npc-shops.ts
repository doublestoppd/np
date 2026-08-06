import type { NpcShopRestockConfig, PrismaClient } from "@prisma/client";

/**
 * NPC shop fixture: region, location, shop, and (optionally) a restock
 * config. Without a config the lazy fallback is a no-op, so stock rows
 * placed by makeStock stay exactly as written.
 */
export async function createTestNpcShop(
  db: PrismaClient,
  {
    prefix,
    config,
  }: {
    prefix: string;
    config?: Partial<
      Pick<
        NpcShopRestockConfig,
        | "intervalMinutes"
        | "anchorAt"
        | "targetListings"
        | "commonMin"
        | "commonMax"
        | "uncommonMin"
        | "uncommonMax"
        | "rareMin"
        | "rareMax"
        | "ultraRareBps"
        | "maxUltraRare"
      >
    >;
  },
) {
  const region = await db.region.create({
    data: {
      slug: `${prefix}-region`,
      name: "Fixture Region",
      description: "",
      artKey: "r",
      published: true,
    },
  });
  const location = await db.location.create({
    data: {
      slug: `${prefix}-location`,
      regionId: region.id,
      name: "Fixture Location",
      description: "",
      artKey: "l",
      published: true,
    },
  });
  const shop = await db.npcShop.create({
    data: {
      locationId: location.id,
      slug: `${prefix}-shop`,
      name: "Fixture Shop",
      description: "",
    },
  });
  if (config) {
    await db.npcShopRestockConfig.create({
      data: { shopId: shop.id, ...config },
    });
  }
  const restock = await db.shopRestock.create({
    data: {
      shopId: shop.id,
      windowStart: new Date("2026-01-01T00:00:00Z"),
      seedId: "fixture",
      status: "COMPLETED",
    },
  });
  return { region, location, shop, restock };
}

export async function makeStock(
  db: PrismaClient,
  {
    shopId,
    restockId,
    itemId,
    quantity,
    price = 10n,
  }: {
    shopId: string;
    restockId: string;
    itemId: string;
    quantity: number;
    price?: bigint;
  },
): Promise<string> {
  const stock = await db.npcShopStock.create({
    data: {
      shopId,
      itemId,
      restockId,
      price,
      quantity,
      initialQuantity: quantity,
      status: "ACTIVE",
    },
  });
  return stock.id;
}

export async function cleanupTestNpcShops(
  db: PrismaClient,
  prefix: string,
): Promise<void> {
  // Ledger rows reference stock/restocks with Restrict FKs by design.
  await db.transaction.deleteMany({
    where: { npcStock: { shop: { slug: { startsWith: prefix } } } },
  });
  await db.npcShopStock.deleteMany({
    where: { shop: { slug: { startsWith: prefix } } },
  });
  await db.shopRestock.deleteMany({
    where: { shop: { slug: { startsWith: prefix } } },
  });
  await db.npcShop.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.region.deleteMany({ where: { slug: { startsWith: prefix } } });
}
