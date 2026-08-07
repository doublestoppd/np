import type { DbReader } from "@/server/db";
import { coinsToJSON } from "@/lib/money";
import { currentGameDate, type GameDate } from "../game-day";
import { bandForUser } from "../bands";
import { LOOKS_PER_DAY, REWARD_BY_LOOK } from "./config";

/**
 * Read-only views of the hunt. Neither of these ever returns where the
 * lantern is: the hiding place leaves the server through exactly one door
 * (a successful look in hunt.ts) and this is not it.
 */

export interface LanternLookView {
  placeName: string;
  regionName: string;
  found: boolean;
  /** Whether that look was at least in the right region. */
  warmRegion: boolean;
}

export interface LanternHuntView {
  gameDate: GameDate;
  /** Null only if the day's hunt has not been drawn yet. */
  clue: string | null;
  status: "SEARCHING" | "FOUND" | "OUT_OF_LOOKS";
  looksUsed: number;
  looksRemaining: number;
  /** Where the player has already been today, in the order they went. */
  looks: LanternLookView[];
  /** Serialized coins earned today ("0" until found). */
  rewardEarned: string;
  /** Serialized coins the next look would pay if it finds it. */
  nextReward: string;
  /** Revealed only after a find. */
  foundAtName: string | null;
}

/**
 * The player's hunt for a day. Read-only: it will happily report that no
 * hunt exists yet rather than drawing one, because a page view is not a
 * reason to write.
 */
export async function getHuntView(
  db: DbReader,
  { userId, gameDate = currentGameDate() }: { userId: string; gameDate?: GameDate },
): Promise<LanternHuntView> {
  const base: LanternHuntView = {
    gameDate,
    clue: null,
    status: "SEARCHING",
    looksUsed: 0,
    looksRemaining: LOOKS_PER_DAY,
    looks: [],
    rewardEarned: "0",
    nextReward: coinsToJSON(REWARD_BY_LOOK[0]!),
    foundAtName: null,
  };
  const hunt = await db.lanternHunt.findUnique({
    where: { gameDate_band: { gameDate, band: bandForUser(userId) } },
    include: {
      clue: {
        select: {
          clue: true,
          location: { select: { name: true } },
        },
      },
    },
  });
  if (!hunt) {
    return base;
  }
  base.clue = hunt.clue.clue;

  const search = await db.lanternSearch.findUnique({
    where: { userId_huntId: { userId, huntId: hunt.id } },
    include: {
      looks: {
        orderBy: { lookNumber: "asc" },
        include: {
          location: {
            select: { name: true, regionId: true, region: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!search) {
    return base;
  }

  const hidingRegionId = await db.lanternClue
    .findUniqueOrThrow({
      where: { id: hunt.clueId },
      select: { location: { select: { regionId: true } } },
    })
    .then((row) => row.location.regionId);

  const looksRemaining = Math.max(0, LOOKS_PER_DAY - search.looksUsed);
  return {
    ...base,
    status: search.status,
    looksUsed: search.looksUsed,
    looksRemaining,
    looks: search.looks.map((look) => ({
      placeName: look.location.name,
      regionName: look.location.region.name,
      found: look.found,
      warmRegion: look.location.regionId === hidingRegionId,
    })),
    rewardEarned: coinsToJSON(search.rewardCoins),
    nextReward: coinsToJSON(
      REWARD_BY_LOOK[search.looksUsed] ?? REWARD_BY_LOOK[REWARD_BY_LOOK.length - 1]!,
    ),
    foundAtName: search.status === "FOUND" ? hunt.clue.location.name : null,
  };
}

/**
 * Whether this player may still look at this particular location today —
 * everything the per-location panel needs to decide what to render, in one
 * query rather than one per page.
 */
export interface LanternLookHereView {
  clue: string | null;
  status: "SEARCHING" | "FOUND" | "OUT_OF_LOOKS";
  looksRemaining: number;
  /** True when this exact place has already been searched today. */
  lookedHere: boolean;
  /** What a find on the next look would pay, serialized. */
  nextReward: string;
}

export async function getLookHereView(
  db: DbReader,
  {
    userId,
    locationId,
    gameDate = currentGameDate(),
  }: { userId: string; locationId: string; gameDate?: GameDate },
): Promise<LanternLookHereView> {
  const hunt = await db.lanternHunt.findUnique({
    where: { gameDate_band: { gameDate, band: bandForUser(userId) } },
    include: { clue: { select: { clue: true } } },
  });
  if (!hunt) {
    return {
      clue: null,
      status: "SEARCHING",
      looksRemaining: LOOKS_PER_DAY,
      lookedHere: false,
      nextReward: coinsToJSON(REWARD_BY_LOOK[0]!),
    };
  }
  const search = await db.lanternSearch.findUnique({
    where: { userId_huntId: { userId, huntId: hunt.id } },
    include: { looks: { where: { locationId }, select: { id: true } } },
  });
  const looksUsed = search?.looksUsed ?? 0;
  return {
    clue: hunt.clue.clue,
    status: search?.status ?? "SEARCHING",
    looksRemaining: Math.max(0, LOOKS_PER_DAY - looksUsed),
    lookedHere: (search?.looks.length ?? 0) > 0,
    nextReward: coinsToJSON(
      REWARD_BY_LOOK[looksUsed] ?? REWARD_BY_LOOK[REWARD_BY_LOOK.length - 1]!,
    ),
  };
}
