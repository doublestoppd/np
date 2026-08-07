import type { LocationActivityType } from "@prisma/client";
import type { DbReader } from "@/server/db";
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
import { dayView as sortingDayView } from "@/server/modules/games/sorting/run";

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
 * Activity types that belong on a "things to play" directory. An NPC shop
 * is a place to spend coins, not an activity with a daily state, so it is
 * left to the world map and the shop pages.
 */
/**
 * Foraging is deliberately absent. The moment a directory lists every
 * spot with a "2 left today" chip, wandering becomes a chore route and
 * the map becomes a checklist — which is the shape CLAUDE.md rules out.
 * A spot is found by going somewhere; the region map badges which
 * locations have one, and that is the whole discovery surface.
 */
const DIRECTORY_TYPES: LocationActivityType[] = [
  "DAILY_WORD",
  "DAILY_WHEEL",
  "DAILY_MEAL",
  "REQUEST_BOARD",
  "SORTING_BENCH",
];

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
        description:
          "Somewhere to look around. What you turn up is what grows there.",
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
