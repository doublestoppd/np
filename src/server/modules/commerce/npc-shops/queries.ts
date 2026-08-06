import type { DbClient } from "@/server/db";
import { ensureShopStocked } from "../restocking/execute";

/**
 * NPC shop read model for a location page. Applies the (non-blocking,
 * documented) lazy restock fallback first; when another request is already
 * restocking, the prior valid inventory is served briefly. Sold-out and
 * expired rows are excluded; restock timing is never included.
 */
export async function getShopForLocation(
  db: DbClient,
  locationId: string,
  now: Date = new Date(),
) {
  const shop = await db.npcShop.findUnique({ where: { locationId } });
  if (!shop || !shop.active) {
    return null;
  }
  await ensureShopStocked(db, shop.id, now);
  const stock = await db.npcShopStock.findMany({
    where: {
      shopId: shop.id,
      status: "ACTIVE",
      quantity: { gt: 0 },
      item: { lifecycle: { in: ["ACTIVE", "RETIRED"] } },
    },
    include: { item: { include: { category: true } } },
    orderBy: [{ item: { rarity: "desc" } }, { item: { name: "asc" } }],
  });
  return { shop, stock };
}
