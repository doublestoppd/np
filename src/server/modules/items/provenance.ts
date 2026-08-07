import type { DbReader } from "@/server/db";

export const PROVENANCE_PAGE_SIZE = 20;

/**
 * Player-facing provenance history for an item instance: append-only
 * relational events (docs/content-model.md), newest first, paginated for
 * long histories. Usernames are resolved for display; internal ids and
 * ledger references stay server-side.
 *
 * `sourceType` is an internal token (`npc-shop:<slug>`, `daily-wheel`, …)
 * and must not be rendered as-is — src/lib/provenance-copy.ts turns it
 * into a sentence. The operator-facing `metadata.note` is deliberately not
 * returned: it embeds the same token in prose.
 */
export async function listProvenance(
  db: DbReader,
  itemInstanceId: string,
  { cursor }: { cursor?: string } = {},
) {
  const rows = await db.itemProvenanceEvent.findMany({
    where: { itemInstanceId },
    include: {
      fromUser: { select: { username: true } },
      toUser: { select: { username: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PROVENANCE_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > PROVENANCE_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PROVENANCE_PAGE_SIZE) : rows;
  return {
    events: page.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      at: event.createdAt,
      sourceType: event.sourceType,
      fromUsername: event.fromUser?.username ?? null,
      toUsername: event.toUser?.username ?? null,
    })),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}
