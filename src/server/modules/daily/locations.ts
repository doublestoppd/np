/**
 * Stable world anchors for the daily activities (seeded in prisma/seed.ts,
 * inside the existing starting region). The location pages render each
 * activity's interface when the slug matches — a deliberate explicit
 * mapping, not a content-driven activity framework.
 */
export const DAILY_REGION_SLUG = "dapplewood";

export const WORD_LOCATION_SLUG = "whisperleaf-reading-room";
export const WHEEL_LOCATION_SLUG = "brassbell-pavilion";
export const MEAL_LOCATION_SLUG = "hearth-and-ladle";

export function dailyLocationPath(locationSlug: string): string {
  return `/explore/${DAILY_REGION_SLUG}/${locationSlug}`;
}
