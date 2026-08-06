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

export type DailyActivityKind = "WORD" | "WHEEL" | "MEAL";

const ACTIVITY_BY_SLUG: Record<string, DailyActivityKind> = {
  [WORD_LOCATION_SLUG]: "WORD",
  [WHEEL_LOCATION_SLUG]: "WHEEL",
  [MEAL_LOCATION_SLUG]: "MEAL",
};

/**
 * The daily activity anchored at a location. Matched by region + location
 * slug: location slugs are only unique within a region, so a bare slug
 * match would wrongly attach activities to same-named locations elsewhere.
 */
export function dailyActivityAt(
  regionSlug: string,
  locationSlug: string,
): DailyActivityKind | null {
  if (regionSlug !== DAILY_REGION_SLUG) {
    return null;
  }
  return ACTIVITY_BY_SLUG[locationSlug] ?? null;
}
