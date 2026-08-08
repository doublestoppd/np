import { Prisma } from "@prisma/client";
import type { DbClient, DbReader, DbTx } from "@/server/db";
import { coinsToJSON } from "@/lib/money";
import { JACKPOT_MINIMUM, JACKPOT_SLUG } from "./config";

/**
 * The Fortune Engine's pool (ADR-66).
 *
 * Its own, not the chits' Pans. Two machines sharing one pool would let a
 * player feed one and take it on the other, and the floor here is tuned to
 * this machine's stake ladder rather than to a card price.
 */

/** Creates the pool row if it is missing, tolerating a concurrent first. */
export async function ensureFortuneJackpot(db: DbClient) {
  const existing = await db.fortuneJackpot.findUnique({
    where: { slug: JACKPOT_SLUG },
  });
  if (existing) return existing;
  try {
    return await db.fortuneJackpot.create({
      data: { slug: JACKPOT_SLUG, pool: 0n, minimum: JACKPOT_MINIMUM },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return db.fortuneJackpot.findUniqueOrThrow({
        where: { slug: JACKPOT_SLUG },
      });
    }
    throw error;
  }
}

export interface FortuneJackpotView {
  /** Serialized coins a win would pay right now. Never below the floor. */
  standsAt: string;
  /** True while the pool itself is still under the floor. */
  atFloor: boolean;
  lastWonAt: Date | null;
  lastWonBy: string | null;
}

export async function getFortuneJackpot(
  db: DbReader,
): Promise<FortuneJackpotView> {
  const row = await db.fortuneJackpot.findUnique({
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
 * Adds the top stake's slice. Called inside the spin transaction, so a
 * pull that rolls back never contributes.
 */
export async function contributeToFortune(
  tx: DbTx,
  amount: bigint,
): Promise<void> {
  if (amount <= 0n) return;
  await tx.fortuneJackpot.updateMany({
    where: { slug: JACKPOT_SLUG },
    data: { pool: { increment: amount } },
  });
}

/**
 * Empties the pool to a winner and returns what they get.
 *
 * Guarded on the pool value read a moment earlier, so two simultaneous
 * jackpot pulls cannot both be paid the same coins: the loser of the race
 * finds a drained pool and takes the floor instead, which is the correct
 * answer — the pool really had already gone.
 */
export async function claimFortuneJackpot(
  tx: DbTx,
  { userId, now }: { userId: string; now: Date },
): Promise<bigint> {
  const row = await tx.fortuneJackpot.findUnique({
    where: { slug: JACKPOT_SLUG },
  });
  const pool = row?.pool ?? 0n;
  const minimum = row?.minimum ?? JACKPOT_MINIMUM;
  const drained = await tx.fortuneJackpot.updateMany({
    where: { slug: JACKPOT_SLUG, pool },
    data: { pool: 0n, lastWonAt: now, lastWonBy: userId },
  });
  if (drained.count === 0) return minimum;
  return pool > minimum ? pool : minimum;
}
