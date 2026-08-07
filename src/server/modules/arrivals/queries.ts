import type { DbClient } from "@/server/db";
import { coinsToJSON } from "@/lib/money";

/**
 * "While you were away."
 *
 * The player's shop already sells things and the till already fills up,
 * and until now a player only found out by navigating to `/shop` and
 * noticing a bigger number. Something genuinely happened in their favour
 * and nothing told them. That is the whole feature.
 *
 * Two rules shape it, and both are load-bearing:
 *
 * 1. **It only ever reports things that happened FOR the player.** It
 *    never enumerates what they missed — no "you skipped 2 wheel spins",
 *    no "3 days since your last visit". That is punitive inactivity in a
 *    friendly font, and CLAUDE.md rules it out.
 * 2. **When nothing happened, there is no panel.** Not "0 new". An empty
 *    state here would be a small daily reproach, and a badge would
 *    manufacture obligation out of an empty list.
 */

/**
 * How stale `lastSeenAt` must be before a visit counts as a return. Below
 * this, a refresh is the same visit and the panel stays put rather than
 * emptying itself out from under the player.
 */
const RETURN_GAP_MS = 30 * 60_000;

export interface ArrivalsView {
  since: Date;
  /** Things the player's shop sold while they were away. */
  sales: {
    count: number;
    /** Serialized coins added to the till by those sales. */
    proceeds: string;
  } | null;
}

/**
 * What happened since the player was last here, and stamps the visit.
 *
 * Returns null when nothing did — the caller renders nothing at all,
 * which is the point.
 */
export async function getArrivals(
  db: DbClient,
  { userId, now = new Date() }: { userId: string; now?: Date },
): Promise<ArrivalsView | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { lastSeenAt: true },
  });
  if (!user) {
    return null;
  }

  // First visit ever: there is no "away" to report on yet.
  if (user.lastSeenAt === null) {
    await touch(db, userId, now);
    return null;
  }

  const since = user.lastSeenAt;
  const away = now.getTime() - since.getTime();
  if (away < RETURN_GAP_MS) {
    // Same visit. Don't advance the stamp and don't report — otherwise a
    // refresh would blank the panel the player is still reading.
    return null;
  }

  // A sale credits the seller's till, not their wallet, so the ledger row
  // carries the amount in metadata and a zero delta. Counting the rows is
  // what matters here; the exact proceeds come from the same rows.
  const sales = await db.transaction.findMany({
    where: { userId, type: "PLAYER_SALE", createdAt: { gte: since, lt: now } },
    select: { quantity: true, metadata: true },
  });

  await touch(db, userId, now);

  if (sales.length === 0) {
    return null;
  }

  let proceeds = 0n;
  for (const sale of sales) {
    const value =
      typeof sale.metadata === "object" &&
      sale.metadata !== null &&
      "proceeds" in sale.metadata
        ? String((sale.metadata as { proceeds?: unknown }).proceeds ?? "0")
        : "0";
    if (/^\d+$/.test(value)) {
      proceeds += BigInt(value);
    }
  }

  return {
    since,
    sales: {
      count: sales.reduce((total, sale) => total + sale.quantity, 0),
      proceeds: coinsToJSON(proceeds),
    },
  };
}

/**
 * Records that the player is here. Best-effort and never part of a
 * transaction: it is a greeting, not an economic fact, and a failure to
 * stamp it must never fail a page.
 */
async function touch(db: DbClient, userId: string, now: Date): Promise<void> {
  await db.user
    .update({ where: { id: userId }, data: { lastSeenAt: now } })
    .catch(() => undefined);
}
