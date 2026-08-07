import type { DbReader } from "@/server/db";

/** Categories for filter UIs, in display order. */
export async function listItemCategories(db: DbReader) {
  return db.itemCategory.findMany({ orderBy: { sortOrder: "asc" } });
}
