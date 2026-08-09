import type { DbReader } from "@/server/db";
import { systemClock, type Clock } from "@/server/clock";

/**
 * "Keepers online" (ADR-70).
 *
 * The line at the bottom of every page in 1999, and the cheapest one to
 * bring back honestly: `User.lastSeenAt` already exists — the arrivals
 * module keeps it — so this is a count, not a new table and not a
 * heartbeat.
 *
 * **A count, never a list.** Who is online is a different feature with a
 * different set of consequences (it tells you when somebody is away from
 * their account, which is a thing people use). A number is the nostalgia;
 * the list was never the good part.
 */

/** How recently somebody has to have been seen to count as "now". */
const WINDOW_MINUTES = 10;

export async function keepersOnline(
  db: DbReader,
  { clock = systemClock }: { clock?: Clock } = {},
): Promise<number> {
  const since = new Date(clock.now().getTime() - WINDOW_MINUTES * 60_000);
  return db.user.count({ where: { lastSeenAt: { gte: since } } });
}
