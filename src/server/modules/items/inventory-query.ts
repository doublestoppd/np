import type { DbReader } from "@/server/db";

export const INVENTORY_SORTS = ["name", "quantity", "value"] as const;
export type InventorySort = (typeof INVENTORY_SORTS)[number];

/** Categories for filter UIs, in display order. */
export async function listItemCategories(db: DbReader) {
  return db.itemCategory.findMany({ orderBy: { sortOrder: "asc" } });
}
