import type { ArcadeGame, LocationActivityType } from "@prisma/client";
import type { DbClient, DbReader } from "@/server/db";
import { listWorldActivities } from "@/server/modules/world/world";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import {
  getWordBoards,
  summarizeWordProgress,
} from "@/server/modules/daily/word/game";
import { getWheelView } from "@/server/modules/daily/wheel/queries";
import { getMealView } from "@/server/modules/daily/food/queries";
import { getBoardView } from "@/server/modules/requests/queries";
import { getSpotView } from "@/server/modules/foraging/queries";
import { getFishingSpotView } from "@/server/modules/fishing/queries";
import { dayView as sortingDayView } from "@/server/modules/games/sorting/run";
import { getHuntView } from "@/server/modules/daily/lantern/queries";
import { dayView as matchingDayView } from "@/server/modules/games/matching/run";
import { MATCHING_DIFFICULTIES } from "@/lib/games/matching-rules";
import { getDelveView } from "@/server/modules/cave/delve";
import { getArcadeDay } from "@/server/modules/games/arcade/run";
import { ARCADE_GAMES } from "@/server/modules/games/arcade/config";
import { getSudokuDirectoryEntry } from "@/server/modules/games/sudoku/queries";
import {
  LANTERN_BLURB,
  LANTERN_NAME,
} from "@/server/modules/daily/lantern/config";

/**
 * The composition layer for "what is there to do today".
 *
 * The home dashboard and /games both used to hardcode three rows, three
 * location names, and three descriptions — which drifted: the request
 * board had no entry anywhere, /games showed the *meal's* claim status
 * under the request board's name, and the same link was called two
 * different things on the two pages. Every one of those was a copy of a
 * fact that already exists in content.
 *
 * So this reads the world's activity attachments and asks each owning
 * domain for the viewer's state, the same shape the render registry uses.
 * Location names come from content; availability comes from the same query
 * the location page itself renders from, so a card can never say
 * "Available" about an activity whose page says it is closed.
 *
 * This module may import both the world query and every activity domain.
 * Nothing under src/server/modules/<activity> imports it, which is what
 * keeps those domains free of each other.
 */

/** Where an activity stands for this player, in domain terms. */
export type ActivityAvailability =
  /** Closed by content or configuration — no page to play today. */
  | { kind: "UNAVAILABLE" }
  /** Nothing done yet today. */
  | { kind: "AVAILABLE" }
  /** Partly done: `done` of `total`. */
  | { kind: "IN_PROGRESS"; done: number; total: number }
  /**
   * Nothing further today. `label` lets an activity say what it was the
   * player did — "Spun today" reads better than a generic "Done for
   * today", and the word belongs to the domain that knows the verb.
   */
  | { kind: "DONE"; label?: string };

export interface ActivityDirectoryEntry {
  /** Stable identity for React keys and tests: type + activity key. */
  key: string;
  type: LocationActivityType;
  href: string;
  /** Activity name, from the activity's own domain. */
  name: string;
  /** Where in the world it is, from content. */
  place: string;
  description: string;
  availability: ActivityAvailability;
}

/**
 * Everything that belongs on "what is there to do today".
 *
 * Foraging and fishing were deliberately absent at first, on the argument
 * that listing every spot with a "2 left today" chip turns wandering into
 * a chore route. That was one reading; the other is that a player who does
 * not know a spot exists never finds it at all, and a directory that
 * silently omits half the things you can do is lying by omission. They are
 * in, and the grouping below is what keeps the page from reading as a
 * checklist: gathering sits in its own section, apart from the things that
 * reset.
 */
export const DIRECTORY_TYPES: LocationActivityType[] = [
  "DAILY_WORD",
  "DAILY_WHEEL",
  "DAILY_MEAL",
  "REQUEST_BOARD",
  "SORTING_BENCH",
  "LANTERN_HUNT",
  "DAILY_DRINK",
  "MATCHING_GAME",
  "SUDOKU",
  "CAVE_DELVE",
  "PAPER_BIRD",
  "TREE_CLIMB",
  "SNAKE",
  "FORAGING",
  "FISHING",
];

/**
 * The sections the page is grouped into, in the order they are shown.
 *
 * Ordered by what a player most likely came for: the free things that
 * reset (and are therefore missable), then the things that ask for some
 * thought, then the ones that ask for nerve, then the ones you do at your
 * own pace and cannot miss.
 */
export const ACTIVITY_GROUPS = [
  {
    key: "free",
    name: "Free every day",
    blurb: "Costs nothing, and resets at midnight GST.",
    types: ["DAILY_MEAL", "DAILY_DRINK", "DAILY_WHEEL", "LANTERN_HUNT"],
  },
  {
    key: "puzzles",
    name: "Puzzles",
    blurb: "Something to think about. Each pays once a day.",
    types: ["DAILY_WORD", "SUDOKU", "MATCHING_GAME", "SORTING_BENCH"],
  },
  {
    key: "nerve",
    name: "Games of nerve",
    blurb: "Quick, and you will lose most of them. Play as often as you like.",
    types: ["PAPER_BIRD", "TREE_CLIMB", "SNAKE", "CAVE_DELVE"],
  },
  {
    key: "gathering",
    name: "Out gathering",
    blurb: "Whatever the woods and the water are giving today.",
    types: ["FORAGING", "FISHING"],
  },
  {
    key: "asked",
    name: "Being asked for",
    blurb: "Somebody wants something, and will pay for it.",
    types: ["REQUEST_BOARD"],
  },
] as const satisfies readonly {
  key: string;
  name: string;
  blurb: string;
  types: readonly LocationActivityType[];
}[];

export type ActivityGroupKey = (typeof ACTIVITY_GROUPS)[number]["key"];

/** Which section an activity belongs in. */
function groupOf(type: LocationActivityType): ActivityGroupKey {
  const group = ACTIVITY_GROUPS.find((candidate) =>
    (candidate.types as readonly LocationActivityType[]).includes(type),
  );
  // Not reachable for anything in DIRECTORY_TYPES, and a sensible landing
  // place if a new type is added to that list and not to a group.
  return group?.key ?? "asked";
}

/**
 * Sort weight for what is still to do.
 *
 * A directory is read to answer "what have I not done yet", so anything
 * open sorts above anything finished. Within a rank, alphabetical, because
 * a stable order is worth more than a clever one when the page is checked
 * every morning.
 */
/**
 * One line each for the directory. Here rather than in ARCADE_GAMES
 * because it is a description of the ROW — the location page has its own,
 * longer, and the two are written for different readers.
 */
const ARCADE_BLURBS: Record<ArcadeGame, string> = {
  PAPER_BIRD:
    "Keep a folded bird up on the gusts for as long as you can. Three goes a day pay out; playing is unlimited.",
  TREE_CLIMB:
    "Bounce up an enormous beech, branch to branch. Three goes a day pay out; playing is unlimited.",
  SNAKE:
    "Something in the marram grass, getting longer and quicker with every apple. Three goes a day pay out; playing is unlimited.",
};

const AVAILABILITY_RANK: Record<ActivityAvailability["kind"], number> = {
  AVAILABLE: 0,
  IN_PROGRESS: 1,
  DONE: 2,
  UNAVAILABLE: 3,
};

export interface ActivityDirectoryGroup {
  key: ActivityGroupKey;
  name: string;
  blurb: string;
  entries: ActivityDirectoryEntry[];
}

/**
 * The directory, in sections, with each section sorted by what is left to
 * do. Empty sections are dropped rather than shown empty — a heading over
 * nothing is a promise the world has not made.
 */
export async function getGroupedActivityDirectory(
  db: DbReader,
  options: { userId: string; gameDate?: GameDate },
): Promise<ActivityDirectoryGroup[]> {
  const entries = await getActivityDirectory(db, options);
  return ACTIVITY_GROUPS.map((group) => ({
    key: group.key,
    name: group.name,
    blurb: group.blurb,
    entries: entries
      .filter((entry) => groupOf(entry.type) === group.key)
      .sort(
        (a, b) =>
          AVAILABILITY_RANK[a.availability.kind] -
            AVAILABILITY_RANK[b.availability.kind] ||
          a.name.localeCompare(b.name),
      ),
  })).filter((group) => group.entries.length > 0);
}

export async function getActivityDirectory(
  db: DbReader,
  {
    userId,
    gameDate = currentGameDate(),
  }: { userId: string; gameDate?: GameDate },
): Promise<ActivityDirectoryEntry[]> {
  const attachments = (await listWorldActivities(db)).filter((attachment) =>
    DIRECTORY_TYPES.includes(attachment.type),
  );

  const entries = await Promise.all(
    attachments.map(async (attachment) => {
      const href = `/explore/${attachment.location.region.slug}/${attachment.location.slug}`;
      const base = {
        key: `${attachment.type}:${attachment.activityKey}`,
        type: attachment.type,
        href,
        place: attachment.location.name,
      };
      const resolved = await describeActivity(db, {
        type: attachment.type,
        activityKey: attachment.activityKey,
        userId,
        gameDate,
      });
      return resolved ? { ...base, ...resolved } : null;
    }),
  );
  return entries.filter((entry) => entry !== null);
}

/**
 * Asks the owning domain what this activity is and where the player
 * stands. Exhaustive over LocationActivityType, so a new activity type is
 * a compile error here rather than a silently missing row.
 *
 * Returns null when the attachment points at something that no longer
 * exists — a directory is not the place to surface a content error, and
 * the location page already isolates broken activities.
 */
async function describeActivity(
  db: DbReader,
  {
    type,
    activityKey,
    userId,
    gameDate,
  }: {
    type: LocationActivityType;
    activityKey: string;
    userId: string;
    gameDate: GameDate;
  },
): Promise<Pick<
  ActivityDirectoryEntry,
  "name" | "description" | "availability"
> | null> {
  switch (type) {
    case "DAILY_WORD": {
      const { finished, started, total } = summarizeWordProgress(
        await getWordBoards(db, { userId, gameDate }),
      );
      return {
        name: "Daily Word Challenge",
        description:
          "Three puzzles a day at four, five, and six letters. Five guesses each.",
        availability:
          total === 0
            ? { kind: "UNAVAILABLE" }
            : finished >= total
              ? { kind: "DONE" }
              : finished > 0 || started
                ? { kind: "IN_PROGRESS", done: finished, total }
                : { kind: "AVAILABLE" },
      };
    }
    case "DAILY_WHEEL": {
      const wheel = await getWheelView(db, {
        userId,
        wheelSlug: activityKey,
        gameDate,
      });
      if (!wheel) return null;
      return {
        name: wheel.wheelName,
        description: "One spin a day for coins or curiosities.",
        availability: !wheel.available
          ? { kind: "UNAVAILABLE" }
          : wheel.todaysSpin
            ? { kind: "DONE", label: "Spun today" }
            : { kind: "AVAILABLE" },
      };
    }
    case "DAILY_MEAL": {
      const meal = await getMealView(db, {
        userId,
        poolSlug: activityKey,
        gameDate,
      });
      return {
        name: "Daily Community Meal",
        description:
          // No "or to cook with": there is no kitchen to cook in, and a
          // player went looking for one twice.
          "A free helping from the kitchen, once a day. Whatever is going.",
        availability: !meal.available
          ? { kind: "UNAVAILABLE" }
          : meal.todaysClaim
            ? { kind: "DONE", label: "Claimed today" }
            : { kind: "AVAILABLE" },
      };
    }
    case "REQUEST_BOARD": {
      const board = await getBoardView(db, {
        userId,
        boardKey: activityKey,
        gameDate,
      });
      if (!board) return null;
      const done = board.completedToday;
      return {
        name: board.name,
        // The board's own words. This used to be one hardcoded sentence
        // about a kitchen, printed under every board — including the
        // lost-property counter in a salt marsh two regions away.
        description: board.description,
        availability: !board.available
          ? { kind: "UNAVAILABLE" }
          : board.remainingToday <= 0
            ? { kind: "DONE" }
            : done > 0
              ? { kind: "IN_PROGRESS", done, total: board.dailyLimit }
              : { kind: "AVAILABLE" },
      };
    }
    case "FORAGING": {
      const spot = await getSpotView(db, {
        userId,
        spotSlug: activityKey,
        gameDate,
      });
      if (!spot) return null;
      return {
        name: spot.name,
        // The spot's own words. A single generic line repeated under every
        // entry is what makes a list of places read as a list of chores.
        description: spot.description,
        availability: !spot.available
          ? { kind: "UNAVAILABLE" }
          : spot.remainingToday <= 0
            ? { kind: "DONE", label: "Searched today" }
            : spot.searchedToday > 0
              ? {
                  kind: "IN_PROGRESS",
                  done: spot.searchedToday,
                  total: spot.dailyLimit,
                }
              : { kind: "AVAILABLE" },
      };
    }
    case "SORTING_BENCH": {
      const day = await sortingDayView(db, { userId });
      return {
        name: "The Sorting Bench",
        description:
          "Sort what comes up off the flats. Play as often as you like; your best of the day is what earns.",
        availability:
          day.nextTierScore === null
            ? { kind: "DONE", label: "Top of the day" }
            : day.bestScore > 0
              ? { kind: "IN_PROGRESS", done: day.bestScore, total: day.nextTierScore }
              : { kind: "AVAILABLE" },
      };
    }
    case "LANTERN_HUNT": {
      const hunt = await getHuntView(db, { userId, gameDate });
      return {
        name: LANTERN_NAME,
        description: LANTERN_BLURB,
        availability:
          hunt.status === "FOUND"
            ? { kind: "DONE", label: "Found today" }
            : hunt.status === "OUT_OF_LOOKS"
              ? { kind: "DONE", label: "Looked everywhere" }
              : hunt.looksUsed > 0
                ? {
                    kind: "IN_PROGRESS",
                    done: hunt.looksUsed,
                    total: hunt.looksUsed + hunt.looksRemaining,
                  }
                : { kind: "AVAILABLE" },
      };
    }
    case "DAILY_DRINK": {
      const drink = await getMealView(db, {
        userId,
        poolSlug: activityKey,
        gameDate,
      });
      return {
        name: "The Warming Hut",
        description:
          "Whatever is on the stove, once a day, for nothing. Nobody keeps a tally.",
        availability: !drink.available
          ? { kind: "UNAVAILABLE" }
          : drink.todaysClaim
            ? { kind: "DONE", label: "Had one today" }
            : { kind: "AVAILABLE" },
      };
    }
    case "MATCHING_GAME": {
      const day = await matchingDayView(db, { userId, gameDate });
      const total = MATCHING_DIFFICULTIES.length;
      return {
        name: "The Stonesetter's Table",
        description:
          "Matched stones, face down, at three sizes. Play as often as you like; each size pays once a day.",
        availability:
          day.paidToday.length >= total
            ? { kind: "DONE", label: "All three cleared" }
            : day.paidToday.length > 0
              ? { kind: "IN_PROGRESS", done: day.paidToday.length, total }
              : { kind: "AVAILABLE" },
      };
    }
    case "SUDOKU": {
      const slate = await getSudokuDirectoryEntry(db, { userId, gameDate });
      return {
        name: "The Morning Slate",
        description:
          "Nine by nine, the same grid for everyone in the valley, chalked fresh every day.",
        availability: slate.solved
          ? { kind: "DONE", label: "Finished today" }
          : slate.started
            ? { kind: "IN_PROGRESS", done: slate.filled, total: slate.blanks }
            : { kind: "AVAILABLE" },
      };
    }
    case "CAVE_DELVE": {
      const delve = await getDelveView(db as DbClient, { userId });
      return {
        name: "The Sunken Stair",
        description:
          "Ten rooms down, two ways on out of each, and something below that knows the way better than you do. One go a day.",
        availability:
          delve.status === "CLEARED" || delve.status === "TURNED_BACK"
            ? { kind: "DONE", label: "Been down today" }
            : delve.status === "IN_PROGRESS"
              ? {
                  kind: "IN_PROGRESS",
                  done: delve.depth,
                  total: delve.totalDepth,
                }
              : { kind: "AVAILABLE" },
      };
    }
    case "PAPER_BIRD":
    case "TREE_CLIMB":
    case "SNAKE": {
      // The arcade games share a row shape because they share a domain —
      // see ARCADE_GAMES. Everything specific to one of them is read out
      // of that table rather than written once per game here.
      const game = type;
      const config = ARCADE_GAMES[game];
      const day = await getArcadeDay(db as DbClient, { userId, game });
      return {
        name: config.name,
        description: ARCADE_BLURBS[game],
        availability:
          day.claimsUsed >= day.claimsPerDay
            ? { kind: "DONE", label: "Three claimed today" }
            : day.claimsUsed > 0
              ? {
                  kind: "IN_PROGRESS",
                  done: day.claimsUsed,
                  total: day.claimsPerDay,
                }
              : { kind: "AVAILABLE" },
      };
    }
    case "SLOT_MACHINE":
      // Absent, and for the same reason foraging is: the drums have no
      // daily state to report. A row saying "Available" every single day
      // about a machine that always takes a token would be a standing
      // invitation to spend, printed on the page a player reads first
      // thing every morning. It is at its location for whoever wants it.
      return null;
    case "FISHING": {
      const spot = await getFishingSpotView(db, {
        userId,
        spotSlug: activityKey,
        gameDate,
      });
      if (!spot) return null;
      return {
        name: spot.name,
        description: spot.description,
        availability: !spot.available
          ? { kind: "UNAVAILABLE" }
          : spot.remainingToday <= 0
            ? { kind: "DONE", label: "Fished out today" }
            : spot.castsToday > 0
              ? {
                  kind: "IN_PROGRESS",
                  done: spot.castsToday,
                  total: spot.dailyLimit,
                }
              : { kind: "AVAILABLE" },
      };
    }
    case "NPC_SHOP":
    case "GIVEAWAY":
      // Filtered out before we get here; the cases exist so adding a type
      // to the enum is a compile error rather than a missing row.
      //
      // The Leaving Shelf is absent for foraging's reason, sharpened. It
      // does have a daily cap, so it *could* render a "3 left today" chip
      // — and that chip would turn taking other people's spares into a
      // quota to clear before bed. Generosity listed as a daily chore
      // stops being generosity. The region map badges the location; going
      // to look is the whole interaction.
      return null;
  }
}
