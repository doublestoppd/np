import type { Prisma } from "@prisma/client";
import type { DbReader } from "@/server/db";

export const INVENTORY_SORTS = ["name", "quantity", "value"] as const;
export type InventorySort = (typeof INVENTORY_SORTS)[number];

export interface InventoryQuery {
  /** Case-insensitive match against item name or description. */
  search?: string;
  /** ItemCategory slug filter. */
  category?: string;
  sort?: InventorySort;
}

const SORT_ORDERINGS: Record<
  InventorySort,
  Prisma.InventoryEntryOrderByWithRelationInput[]
> = {
  name: [{ item: { name: "asc" } }],
  quantity: [{ quantity: "desc" }, { item: { name: "asc" } }],
  value: [{ item: { price: "desc" } }, { item: { name: "asc" } }],
};

/**
 * Lists a user's owned items (quantity > 0) with search, category filtering,
 * and sorting. All filtering happens in the database query, so the same
 * behavior backs the inventory page and future pickers.
 */
export async function listInventory(
  db: DbReader,
  userId: string,
  { search, category, sort = "name" }: InventoryQuery = {},
) {
  const itemFilters: Prisma.ItemWhereInput[] = [
    { lifecycle: { in: ["ACTIVE", "RETIRED"] } },
  ];
  if (search && search.trim() !== "") {
    const term = search.trim();
    itemFilters.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
      ],
    });
  }
  if (category) {
    itemFilters.push({ category: { slug: category } });
  }

  return db.inventoryEntry.findMany({
    where: {
      userId,
      quantity: { gt: 0 },
      item: { AND: itemFilters },
    },
    include: { item: { include: { category: true, tags: true } } },
    orderBy: SORT_ORDERINGS[sort],
  });
}

/** Categories for filter UIs, in display order. */
export async function listItemCategories(db: DbReader) {
  return db.itemCategory.findMany({ orderBy: { sortOrder: "asc" } });
}
