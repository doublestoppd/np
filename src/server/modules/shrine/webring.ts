import type { DbClient, DbReader } from "@/server/db";
import { systemClock, type Clock } from "@/server/clock";
import { ShrineError } from "./errors";

/**
 * The webring (ADR-70). SERVER ONLY.
 *
 * **The navigation structure of the entire old web, and the reason it is
 * worth rebuilding: it is discovery without ranking.** A ring has no top,
 * no featured slot, no sort by popularity and no way to be near the front,
 * because it has no front. Every member has exactly one page before them
 * and one after, and the only way to see the ring is to walk it.
 *
 * That is a real answer to the problem the Shrine left open — nobody could
 * find anybody else's page — and it is the one answer that does not turn a
 * personal page into a leaderboard. A "most visited shrines" list would
 * have been three lines of SQL and the end of the whole idea.
 *
 * Order is by `ringJoinedAt`, so a member's position is simply when they
 * joined, and it never changes. Leaving closes the gap; nobody moves.
 */

export interface RingNeighbours {
  /** How many shrines are in the ring, including this one. */
  size: number;
  /** 1-based, and shown only as "n of m" — a position, not a rank. */
  position: number;
  previous: string;
  next: string;
  /** Somebody else's, chosen at random. Never this one, unless alone. */
  random: string;
}

/** Everybody in the ring, in ring order. Published members only. */
async function ringMembers(db: DbReader) {
  return db.shrine.findMany({
    where: { published: true, ringJoinedAt: { not: null } },
    orderBy: [{ ringJoinedAt: "asc" }, { id: "asc" }],
    select: { id: true, user: { select: { username: true } } },
  });
}

/** How many shrines are in the ring right now. */
export async function ringSize(db: DbReader): Promise<number> {
  return db.shrine.count({
    where: { published: true, ringJoinedAt: { not: null } },
  });
}

/**
 * Where a shrine sits in the ring, and who is on either side.
 *
 * Returns null when the shrine is not a member — the strip is simply not
 * drawn. Reads the whole ring rather than doing two windowed queries: it
 * is one small query against a set that is at most a few thousand rows,
 * and the wrap-around at both ends is where a clever query goes wrong.
 */
export async function getRingNeighbours(
  db: DbReader,
  { username }: { username: string },
): Promise<RingNeighbours | null> {
  const members = await ringMembers(db);
  const index = members.findIndex(
    (member) => member.user.username.toLowerCase() === username.toLowerCase(),
  );
  if (index === -1) return null;

  const size = members.length;
  // The modulo is the ring: the last member's next is the first, which is
  // the only thing that makes it a ring rather than a list.
  const previous = members[(index - 1 + size) % size];
  const next = members[(index + 1) % size];

  // Random excludes the current page, so "Random" never reloads what you
  // are already looking at — which reads as a broken button.
  let random = members[index];
  if (size > 1) {
    const offset = 1 + Math.floor(Math.random() * (size - 1));
    random = members[(index + offset) % size];
  }

  return {
    size,
    position: index + 1,
    previous: previous?.user.username ?? username,
    next: next?.user.username ?? username,
    random: random?.user.username ?? username,
  };
}

/** A shrine picked at random from the whole ring, for the "surprise me" link. */
export async function randomRingMember(
  db: DbReader,
): Promise<string | null> {
  const members = await ringMembers(db);
  if (members.length === 0) return null;
  const chosen = members[Math.floor(Math.random() * members.length)];
  return chosen?.user.username ?? null;
}

/**
 * Joins or leaves.
 *
 * Joining stamps the time, which is the position. Rejoining after leaving
 * puts a shrine at the end rather than back where it was — the ring is
 * ordered by when you joined it, and that is the honest reading of having
 * left.
 */
export async function setRingMembership(
  db: DbClient,
  {
    userId,
    join,
    clock = systemClock,
  }: { userId: string; join: boolean; clock?: Clock },
): Promise<void> {
  const shrine = await db.shrine.findUnique({
    where: { userId },
    select: { id: true, published: true, ringJoinedAt: true },
  });
  if (!shrine) throw new ShrineError("NO_SHRINE");
  // A ring of pages nobody can open is a ring of dead links.
  if (join && !shrine.published) throw new ShrineError("NOT_PUBLISHED");

  // Already in it: leave the stamp alone rather than shuffling a member to
  // the back of the ring for pressing a button twice.
  if (join && shrine.ringJoinedAt) return;

  await db.shrine.update({
    where: { userId },
    data: { ringJoinedAt: join ? clock.now() : null },
  });
}
