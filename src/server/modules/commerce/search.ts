import type { Prisma, Rarity } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { purchasablePlayerListingWhere } from "./policies";

/**
 * Market search: the items players are selling right now.
 *
 * The market is a marketplace, not a catalog index — an item nobody has
 * listed cannot be bought, so showing it is an offer the page cannot
 * honour. `purchasablePlayerListingWhere()` is the same predicate the
 * purchase command enforces (docs/conventions.md — public reads use the
 * eligibility predicates of the writes they advertise), so a listing that
 * would be refused at checkout never puts its item on this page.
 *
 * Pagination is offset-based rather than by cursor. The result set is a
 * bounded, name-ordered catalogue that players page through deliberately,
 * so a total, a page count, and the ability to jump are worth more here
 * than a cursor's stability under concurrent inserts.
 */

export interface ItemSearchQuery {
  q?: string;
  category?: string;
  rarity?: Rarity;
  /** 1-based; clamped to the available range. */
  page: number;
  perPage: number;
}

export interface ItemSearchResult {
  items: Awaited<ReturnType<typeof findPage>>;
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

function buildFilters(query: ItemSearchQuery): Prisma.ItemWhereInput {
  const filters: Prisma.ItemWhereInput[] = [
    // Redundant with the listing predicate below (which constrains its own
    // item), and kept anyway: this page's own visibility rule should be
    // legible here rather than inferred from a listing's join.
    { lifecycle: { in: ["ACTIVE", "RETIRED"] } },
    { playerListings: { some: purchasablePlayerListingWhere() } },
  ];
  if (query.q && query.q.trim() !== "") {
    filters.push({ name: { contains: query.q.trim(), mode: "insensitive" } });
  }
  if (query.category) {
    filters.push({ category: { slug: query.category } });
  }
  if (query.rarity) {
    filters.push({ rarity: query.rarity });
  }
  return { AND: filters };
}

function findPage(
  db: DbClient,
  where: Prisma.ItemWhereInput,
  skip: number,
  take: number,
) {
  return db.item.findMany({
    where,
    include: {
      category: true,
      _count: {
        select: { playerListings: { where: purchasablePlayerListingWhere() } },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip,
    take,
  });
}

export async function searchItems(
  db: DbClient,
  query: ItemSearchQuery,
): Promise<ItemSearchResult> {
  const where = buildFilters(query);
  const total = await db.item.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / query.perPage));
  // Counting first lets an out-of-range `?page=` land on the last real
  // page instead of an empty one that says "nothing matches".
  const page = Math.min(Math.max(1, query.page), pageCount);
  const items = await findPage(db, where, (page - 1) * query.perPage, query.perPage);

  return { items, total, page, perPage: query.perPage, pageCount };
}
