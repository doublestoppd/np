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
 */
export const DAILY_REGION_SLUG = "dapplewood";

export const WORD_LOCATION_SLUG = "whisperleaf-reading-room";
export const WHEEL_LOCATION_SLUG = "brassbell-pavilion";
export const MEAL_LOCATION_SLUG = "hearth-and-ladle";

export function dailyLocationPath(locationSlug: string): string {
  return `/explore/${DAILY_REGION_SLUG}/${locationSlug}`;
}
