import type { LocationActivityType } from "@prisma/client";
import { log } from "@/server/logging";
import { DomainError } from "@/server/errors";
import { ActivityUnavailable } from "./activity-section";
import { NpcShopLocationActivity } from "./npc-shop-activity";
import { DailyWordLocationActivity } from "./daily-word-activity";
import { DailyWheelLocationActivity } from "./daily-wheel-activity";
import { DailyMealLocationActivity } from "./daily-meal-activity";
import { RequestBoardLocationActivity } from "./request-board-activity";
import type {
  LocationActivityRegistry,
  LocationActivityRendererProps,
} from "./types";

/**
 * The one place activity types map to renderers. `satisfies` makes this
 * exhaustive at compile time: adding a value to LocationActivityType
 * without registering a renderer is a type error, so there is no runtime
 * "unknown activity" branch to forget.
 *
 * This module is the composition layer — it may import both the world
 * query and every activity domain. Nothing under src/server/modules
 * imports it, which is what keeps the world domain free of feature
 * dependencies.
 */
export const locationActivityRegistry = {
  NPC_SHOP: NpcShopLocationActivity,
  DAILY_WORD: DailyWordLocationActivity,
  DAILY_WHEEL: DailyWheelLocationActivity,
  DAILY_MEAL: DailyMealLocationActivity,
  REQUEST_BOARD: RequestBoardLocationActivity,
} satisfies LocationActivityRegistry;

export const REGISTERED_ACTIVITY_TYPES = Object.keys(
  locationActivityRegistry,
) as LocationActivityType[];

/**
 * Renders one attachment, isolating failures: a misconfigured or broken
 * activity becomes an unavailable panel for that section only, and the
 * operator gets a log line with the type, key, location, and error code.
 * The player never sees the underlying reason.
 */
export async function renderLocationActivity(
  props: LocationActivityRendererProps,
): Promise<React.ReactNode> {
  const { attachment, location } = props;
  const renderer = locationActivityRegistry[attachment.type];
  try {
    return await renderer(props);
  } catch (error) {
    log.error("location-activity.render-failed", {
      activityType: attachment.type,
      activityKey: attachment.activityKey,
      locationId: location.id,
      locationSlug: `${location.regionSlug}/${location.slug}`,
      code: error instanceof DomainError ? error.code : "UNEXPECTED",
      error: error instanceof Error ? error.message.slice(0, 200) : String(error),
    });
    return <ActivityUnavailable />;
  }
}
