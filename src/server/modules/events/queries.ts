import type { DbReader } from "@/server/db";
import { coinsToJSON } from "@/lib/money";
import type { ResolvedEventPayload } from "./types";

/**
 * Read paths for the occurrence log. Everything returned comes from the
 * frozen payload written when the event happened — the catalog is never
 * consulted here, so history keeps saying what it said on the day.
 */

export interface OccurrenceView {
  id: string;
  eventKey: string;
  title: string;
  message: string;
  category: string;
  rarity: string;
  rewardSummary: string;
  effects: ResolvedEventPayload["effects"];
  /** Decimal string; coins are bigint end to end (src/lib/money.ts). */
  coinsAwarded: string;
  routePath: string | null;
  createdAt: Date;
}

const PAGE_SIZE = 20;

function toView(row: {
  id: string;
  eventKey: string;
  title: string;
  message: string;
  payload: unknown;
  coinsAwarded: bigint;
  routePath: string | null;
  createdAt: Date;
}): OccurrenceView {
  // A payload written by an older shape must not break the page; missing
  // fields fall back to the columns, which are never null.
  const payload = (row.payload ?? {}) as Partial<ResolvedEventPayload>;
  return {
    id: row.id,
    eventKey: row.eventKey,
    title: row.title,
    message: row.message,
    category: payload.category ?? "grove",
    rarity: payload.rarity ?? "common",
    rewardSummary: payload.rewardSummary ?? "",
    effects: payload.effects ?? [],
    coinsAwarded: coinsToJSON(row.coinsAwarded),
    routePath: row.routePath,
    createdAt: row.createdAt,
  };
}

/** Newest-first page of a player's events, cursor-paginated. */
export async function getRandomEventHistory(
  db: DbReader,
  { userId, cursor }: { userId: string; cursor?: string },
): Promise<{ entries: OccurrenceView[]; nextCursor: string | null }> {
  const rows = await db.randomEventOccurrence.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return {
    entries: page.map(toView),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/** A single occurrence, for verifying an event whose response was lost. */
export async function getOccurrence(
  db: DbReader,
  { userId, occurrenceId }: { userId: string; occurrenceId: string },
): Promise<OccurrenceView | null> {
  const row = await db.randomEventOccurrence.findFirst({
    where: { id: occurrenceId, userId },
  });
  return row ? toView(row) : null;
}
