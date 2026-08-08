import { Prisma } from "@prisma/client";
import type { DbClient, DbReader, DbTx } from "@/server/db";
import { coinsToJSON } from "@/lib/money";
import { JACKPOT_MINIMUM, JACKPOT_SLUG } from "./config";

/**
 * The Pans: one shared, world-wide pool (ADR-48).
 *
 * Every scratch puts a slice of the card's price in. The top outcome on
 * any tier takes the lot. A jackpot that is not shared is just a big
 * prize — the point of this one is that it is visibly somebody else's
 * money accumulating until it is yours, and that a thin chit can take it.
 */

/** Creates the pool row if it is missing, tolerating a concurrent first. */
export async function ensureJackpot(db: DbClient) {
  const existing = await db.scratchJackpot.findUnique({
    where: { slug: JACKPOT_SLUG },
  });
  if (existing) return existing;
  try {
    return await db.scratchJackpot.create({
      data: { slug: JACKPOT_SLUG, pool: 0n, minimum: JACKPOT_MINIMUM },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return db.scratchJackpot.findUniqueOrThrow({
        where: { slug: JACKPOT_SLUG },
      });
    }
    throw error;
  }
}

export interface JackpotView {
  /** Serialized coins a win would pay right now (never below the floor). */
  standsAt: string;
  /** True while the pool itself is under the floor. */
  atFloor: boolean;
  lastWonAt: Date | null;
  lastWonBy: string | null;
}

/** What the pool stands at, for display. */
export async function getJackpot(db: DbReader): Promise<JackpotView> {
  const row = await db.scratchJackpot.findUnique({
    where: { slug: JACKPOT_SLUG },
    include: { winner: { select: { username: true } } },
  });
  const pool = row?.pool ?? 0n;
  const minimum = row?.minimum ?? JACKPOT_MINIMUM;
  return {
    standsAt: coinsToJSON(pool > minimum ? pool : minimum),
    atFloor: pool <= minimum,
    lastWonAt: row?.lastWonAt ?? null,
    lastWonBy: row?.winner?.username ?? null,
  };
}

/**
 * Adds a slice to the pool. Called inside the scratch transaction, so a
 * scratch that rolls back never contributes.
 */
export async function contribute(tx: DbTx, amount: bigint): Promise<void> {
  if (amount <= 0n) return;
  await tx.scratchJackpot.updateMany({
    where: { slug: JACKPOT_SLUG },
    data: { pool: { increment: amount } },
  });
}

/**
 * Empties the pool to a winner and returns what they get.
 *
 * The claim is guarded on the pool value read a moment earlier, so two
 * simultaneous jackpot cards cannot both be paid the same coins: the
 * loser of the race sees a drained pool and takes the floor instead. That
 * is the correct outcome — the pool was genuinely already gone.
 */
export async function claimJackpot(
  tx: DbTx,
  { userId, now }: { userId: string; now: Date },
): Promise<bigint> {
  const row = await tx.scratchJackpot.findUnique({
    where: { slug: JACKPOT_SLUG },
  });
  const pool = row?.pool ?? 0n;
  const minimum = row?.minimum ?? JACKPOT_MINIMUM;
  const drained = await tx.scratchJackpot.updateMany({
    where: { slug: JACKPOT_SLUG, pool },
    data: { pool: 0n, lastWonAt: now, lastWonBy: userId },
  });
  if (drained.count === 0) {
    // Somebody else took it between the read and the write.
    return minimum;
  }
  return pool > minimum ? pool : minimum;
}
