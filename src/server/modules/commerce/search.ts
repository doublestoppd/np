import type { Prisma, Rarity } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { purchasablePlayerListingWhere } from "./policies";

/**
 * Item catalog search and listing browsing. Queries are bounded (cursor
 * pagination, capped page size) and filter values are validated by the
 * callers with Zod before reaching here.
 */

export const SEARCH_PAGE_SIZE = 24;

export interface ItemSearchQuery {
  q?: string;
  category?: string;
  rarity?: Rarity;
  tradeableOnly?: boolean;
  cursor?: string;
}

export async function searchItems(db: DbClient, query: ItemSearchQuery) {
  const filters: Prisma.ItemWhereInput[] = [{ lifecycle: { in: ["ACTIVE", "RETIRED"] } }];
  if (query.q && query.q.trim() !== "") {
    filters.push({ name: { contains: query.q.trim(), mode: "insensitive" } });
  }
  if (query.category) {
    filters.push({ category: { slug: query.category } });
  }
  if (query.rarity) {
    filters.push({ rarity: query.rarity });
  }
  if (query.tradeableOnly) {
    filters.push({ tradeable: true });
  }

  const items = await db.item.findMany({
    where: { AND: filters },
    include: {
      category: true,
      _count: {
        select: { playerListings: { where: purchasablePlayerListingWhere() } },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: SEARCH_PAGE_SIZE + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > SEARCH_PAGE_SIZE;
  const page = hasMore ? items.slice(0, SEARCH_PAGE_SIZE) : items;
  return {
    items: page,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}
