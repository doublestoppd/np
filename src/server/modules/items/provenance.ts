import type { DbReader } from "@/server/db";

export const PROVENANCE_PAGE_SIZE = 20;

/** One history line, as a page receives it. */
export interface ProvenanceEventView {
  id: string;
  eventType: string;
  at: Date;
  /** Internal token — render through src/lib/provenance-copy.ts. */
  sourceType: string;
  fromUsername: string | null;
  toUsername: string | null;
}

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

/** Per-instance history cap on the item page's combined read. */
export const INSTANCE_PROVENANCE_LIMIT = 10;

/**
 * Provenance for a page's worth of instances in ONE query, keyed by
 * instance id.
 *
 * The item page holds up to 100 owned copies, and asking per copy fired
 * ~100 concurrent joined queries per page view — on an authenticated GET
 * with no rate limit, against a definition a player can own 100 of. One
 * query with an `in` filter costs the same as one.
 *
 * Each instance keeps its most recent `INSTANCE_PROVENANCE_LIMIT` events;
 * a copy with a longer story is read in full on its own, through
 * `listProvenance`. Sources are internal tokens — render them through
 * src/lib/provenance-copy.ts.
 */
export async function provenanceByInstance(
  db: DbReader,
  itemInstanceIds: string[],
): Promise<Map<string, ProvenanceEventView[]>> {
  const byInstance = new Map<string, ProvenanceEventView[]>();
  if (itemInstanceIds.length === 0) {
    return byInstance;
  }
  const rows = await db.itemProvenanceEvent.findMany({
    where: { itemInstanceId: { in: itemInstanceIds } },
    include: {
      fromUser: { select: { username: true } },
      toUser: { select: { username: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  for (const event of rows) {
    const existing = byInstance.get(event.itemInstanceId) ?? [];
    if (existing.length >= INSTANCE_PROVENANCE_LIMIT) {
      continue;
    }
    existing.push({
      id: event.id,
      eventType: event.eventType,
      at: event.createdAt,
      sourceType: event.sourceType,
      fromUsername: event.fromUser?.username ?? null,
      toUsername: event.toUser?.username ?? null,
    });
    byInstance.set(event.itemInstanceId, existing);
  }
  return byInstance;
}
