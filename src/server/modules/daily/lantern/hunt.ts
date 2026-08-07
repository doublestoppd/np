import { Prisma, type LanternHunt } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { withIdempotency, requestHash } from "@/server/security/idempotency";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { coinsToJSON } from "@/lib/money";
import { assertGameDate, currentGameDate, type GameDate } from "../game-day";
import { ROTATION_BANDS, bandForUser, keyedIndex } from "../bands";
import { LanternError } from "./errors";
import {
  LOOKS_PER_DAY,
  enforceLanternRateLimit,
  rewardForLook,
} from "./config";

/**
 * Where the lantern is, and what happens when somebody looks.
 *
 * One hiding place per (game date, rotation band), drawn by the shared
 * keyed rotation over the ACTIVE clue rows (modules/daily/bands.ts). The
 * banding is the same anti-leak machinery the word puzzle uses and it
 * matters more here, not less: the answer to "where is it today" is four
 * words long and travels through a chat window instantly.
 *
 * A hunt row freezes its clue reference at creation, so retiring a riddle
 * or rotating the secret changes where the lantern goes *tomorrow* and can
 * never move it out from under somebody mid-search.
 */

/** Draws the hiding place for a band and creates the row if it is missing. */
export async function ensureHunt(
  db: DbClient,
  gameDate: GameDate,
  band: number,
): Promise<LanternHunt> {
  assertGameDate(gameDate);
  const existing = await db.lanternHunt.findUnique({
    where: { gameDate_band: { gameDate, band } },
  });
  if (existing) {
    return existing;
  }
  // Ordered so the draw is reproducible: the index means nothing without
  // a stable list behind it.
  const places = await db.lanternClue.findMany({
    where: { active: true, location: { published: true } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (places.length === 0) {
    log.error("lantern.no-hiding-places", { gameDate });
    throw new LanternError("NO_HIDING_PLACES");
  }
  const index = keyedIndex({
    purpose: "lantern",
    gameDate,
    band,
    count: places.length,
  });
  const clueId = (places[index] as { id: string }).id;
  try {
    const created = await db.lanternHunt.create({
      data: { gameDate, band, clueId },
    });
    log.info("lantern.hunt-created", { gameDate, band });
    return created;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return db.lanternHunt.findUniqueOrThrow({
        where: { gameDate_band: { gameDate, band } },
      });
    }
    throw error;
  }
}

/**
 * Pre-generates every band's hunt for a date (scheduler path).
 *
 * Set-based for the same reason the word puzzles are: the cron calls this
 * twice a run, and 32 sequential ensure calls would be 32 round trips to
 * discover that nothing needs doing.
 */
export async function ensureDailyHunts(
  db: DbClient,
  gameDate: GameDate,
): Promise<number> {
  assertGameDate(gameDate);
  const existing = await db.lanternHunt.findMany({
    where: { gameDate },
    select: { band: true },
  });
  const present = new Set(existing.map((hunt) => hunt.band));
  const missingBands = Array.from(
    { length: ROTATION_BANDS },
    (_, band) => band,
  ).filter((band) => !present.has(band));
  if (missingBands.length === 0) {
    return 0;
  }
  const places = await db.lanternClue.findMany({
    where: { active: true, location: { published: true } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (places.length === 0) {
    log.error("lantern.no-hiding-places", { gameDate });
    throw new LanternError("NO_HIDING_PLACES");
  }
  const rows = missingBands.map((band) => ({
    gameDate,
    band,
    clueId: (
      places[
        keyedIndex({ purpose: "lantern", gameDate, band, count: places.length })
      ] as { id: string }
    ).id,
  }));
  const created = await db.lanternHunt.createMany({
    data: rows,
    skipDuplicates: true,
  });
  log.info("lantern.hunts-created", { gameDate, created: created.count });
  return created.count;
}

/**
 * Draws this player's hunt for today if the scheduler has not yet run —
 * the lazy fallback, same shape as the shops'.
 *
 * The notice board calls this on render, which is a write on a page view
 * and is deliberate. Everywhere else in the game a read stays a read, but
 * the riddle *is* this activity's content: without a drawn hunt there is
 * nothing to post, and a player arriving before the first cron of the day
 * would be told the note is blank with no way to change that. It writes
 * at most one row per band per day and the cron normally gets there
 * first.
 */
export async function ensureHuntForUser(
  db: DbClient,
  userId: string,
  gameDate: GameDate = currentGameDate(),
): Promise<LanternHunt> {
  return ensureHunt(db, gameDate, bandForUser(userId));
}

/** Ensures the player's search row exists, tolerating a concurrent first look. */
async function ensureSearch(
  db: DbClient,
  userId: string,
  huntId: string,
): Promise<void> {
  const existing = await db.lanternSearch.findUnique({
    where: { userId_huntId: { userId, huntId } },
  });
  if (existing) return;
  try {
    await db.lanternSearch.create({ data: { userId, huntId } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }
}

export interface LookResult {
  [key: string]: string | number | boolean | null;
  gameDate: GameDate;
  found: boolean;
  lookNumber: number;
  looksRemaining: number;
  /** Serialized coins; "0" unless this look found the lantern. */
  rewardCoins: string;
  rewardTransactionId: string | null;
  /**
   * Whether the searched location is in the same region as the lantern.
   * The consolation for a miss, and the reason three looks is a game
   * rather than a coin toss — null once found, since it would be noise.
   */
  warmRegion: boolean | null;
  /** Where the player looked, for the message. */
  placeName: string;
  /** Revealed ONLY on a find. */
  foundAtName: string | null;
}

/**
 * Looks for the lantern at one location.
 *
 * The client contributes the place and an idempotency key and nothing
 * else — the hiding place, whether this is a find, how many looks are
 * left, and what it pays are all decided here. A look is consumed whether
 * or not it finds anything, which is what makes the riddle worth reading;
 * the same look is never consumed twice, because the counter advances
 * under an equality guard and the whole thing sits inside an idempotency
 * key.
 */
export async function lookForLantern(
  db: DbClient,
  {
    userId,
    locationId,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    locationId: string;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<{ result: LookResult; replayed: boolean }> {
  await enforceLanternRateLimit(db, userId, clock.now());
  const gameDate = currentGameDate(clock);

  const place = await db.location.findFirst({
    where: { id: locationId, published: true },
    select: { id: true, name: true, regionId: true },
  });
  if (!place) {
    throw new LanternError("UNKNOWN_PLACE");
  }

  const hunt = await ensureHunt(db, gameDate, bandForUser(userId));
  // Outside the transaction: a P2002 raised inside would abort it, and
  // there is no re-reading the winner's row from inside an aborted one.
  await ensureSearch(db, userId, hunt.id);

  const hidingPlace = await db.lanternClue.findUniqueOrThrow({
    where: { id: hunt.clueId },
    select: {
      location: { select: { id: true, name: true, regionId: true } },
    },
  });

  const { result, replayed } = await withIdempotency<LookResult>(
    db,
    {
      userId,
      operation: "lantern-look",
      key: idempotencyKey,
      requestHash: requestHash({ huntId: hunt.id, locationId: place.id }),
    },
    async (tx) => {
      const search = await tx.lanternSearch.findUniqueOrThrow({
        where: { userId_huntId: { userId, huntId: hunt.id } },
      });
      if (search.status === "FOUND") {
        throw new LanternError("ALREADY_FOUND");
      }
      if (search.looksUsed >= LOOKS_PER_DAY) {
        throw new LanternError("OUT_OF_LOOKS");
      }
      const alreadyHere = await tx.lanternLook.findFirst({
        where: { searchId: search.id, locationId: place.id },
        select: { id: true },
      });
      if (alreadyHere) {
        // Refused before the counter moves, so a mis-tap costs nothing.
        // Looking twice in one place cannot find anything the first look
        // missed, and charging for it would be charging for a typo.
        throw new LanternError("ALREADY_LOOKED_HERE");
      }

      // Equality-guarded advance: two looks cannot share a number or
      // together exceed the day's allowance.
      const advanced = await tx.lanternSearch.updateMany({
        where: {
          id: search.id,
          status: "SEARCHING",
          looksUsed: search.looksUsed,
        },
        data: { looksUsed: { increment: 1 } },
      });
      if (advanced.count === 0) {
        throw new LanternError("CONCURRENT_LOOK");
      }
      const lookNumber = search.looksUsed + 1;
      const found = place.id === hidingPlace.location.id;

      await tx.lanternLook.create({
        data: { searchId: search.id, lookNumber, locationId: place.id, found },
      });

      let rewardTransactionId: string | null = null;
      let rewardCoins = 0n;
      if (found) {
        rewardCoins = rewardForLook(lookNumber);
        if (rewardCoins > 0n) {
          const ledger = await recordLedger(tx, {
            userId,
            type: "LANTERN_FOUND",
            coinsDelta: rewardCoins,
            note: `Found the lantern on look ${lookNumber}`,
            metadata: { gameDate, lookNumber, huntId: hunt.id },
          });
          await creditCoins(tx, { userId, amount: rewardCoins });
          rewardTransactionId = ledger.id;
        }
        await tx.lanternSearch.update({
          where: { id: search.id },
          data: {
            status: "FOUND",
            foundAt: clock.now(),
            rewardCoins,
            rewardTransactionId,
          },
        });
      } else if (lookNumber >= LOOKS_PER_DAY) {
        await tx.lanternSearch.update({
          where: { id: search.id },
          data: { status: "OUT_OF_LOOKS" },
        });
      }

      return {
        gameDate,
        found,
        lookNumber,
        looksRemaining: LOOKS_PER_DAY - lookNumber,
        rewardCoins: coinsToJSON(rewardCoins),
        rewardTransactionId,
        warmRegion: found ? null : place.regionId === hidingPlace.location.regionId,
        placeName: place.name,
        // The lantern's whereabouts leave the server only once found.
        foundAtName: found ? hidingPlace.location.name : null,
      } satisfies LookResult;
    },
  );

  log.info("lantern.look", {
    userId,
    gameDate,
    found: result.found,
    lookNumber: result.lookNumber,
    replayed,
    rewardTransactionId: result.rewardTransactionId,
  });
  return { result, replayed };
}
