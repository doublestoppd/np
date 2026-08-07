/**
 * Stable world anchors for the daily activities: where the dashboard and
 * history link to, and which paths the daily actions revalidate.
 *
 * These are LINK TARGETS ONLY. What renders at a location is decided by
 * its activity attachments and the typed registry
 * (src/components/location-activities/registry.tsx) — no page compares a
 * location slug to decide which feature to show. Content validation
 * asserts each of these locations exists, is published, and carries the
 * matching activity attachment.
 *
 * Each anchor carries its own region: the dailies no longer all live in
 * Dapplewood, and a bare location slug is ambiguous across regions.
 */
export const DAILY_REGION_SLUG = "dapplewood";

export const WORD_LOCATION_SLUG = "whisperleaf-reading-room";
export const WHEEL_LOCATION_SLUG = "brassbell-pavilion";
export const MEAL_LOCATION_SLUG = "hearth-and-ladle";

export const DRINK_REGION_SLUG = "tarnreach";
export const DRINK_LOCATION_SLUG = "the-warming-hut";

export function dailyLocationPath(
  locationSlug: string,
  regionSlug: string = DAILY_REGION_SLUG,
): string {
  return `/explore/${regionSlug}/${locationSlug}`;
}
