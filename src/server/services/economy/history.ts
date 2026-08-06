import type { PrismaClient } from "@prisma/client";

export const HISTORY_PAGE_SIZE = 25;

/**
 * A player's commerce history: NPC purchases, player-shop purchases,
 * listings, sales, cancellations, proceeds claims, and capacity upgrades —
 * plus care activity. Ledger rows are read-only here; counterparties are
 * identified by username only. Administrative fields (security events, IPs,
 * risk data) are never included.
 */
export async function playerHistory(
  db: PrismaClient,
  userId: string,
  { cursor }: { cursor?: string } = {},
) {
  const rows = await db.transaction.findMany({
    where: { userId },
    include: {
      item: { select: { slug: true, name: true } },
      counterparty: { select: { username: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > HISTORY_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, HISTORY_PAGE_SIZE) : rows;
  return {
    entries: page,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}
