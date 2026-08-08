/**
 * Route eligibility for random-event rolls. Pure, so it is testable
 * without a database and shared verbatim between the roll command and the
 * catalog's per-event route rules.
 *
 * The list is an ALLOW-list. A deny-list would silently opt every future
 * route in, which is the wrong default for something that grants coins:
 * a new admin screen, a payment flow, or a form should not become an
 * event surface because nobody remembered to exclude it.
 *
 * The client reports which route it is on, and the client can lie. That
 * costs nothing: claiming an eligible path only gets you a roll you could
 * have had by visiting an eligible page, and the pacing that actually
 * bounds rewards — anti-duplicate window, cooldown, probability, rate
 * limit — is entirely server-side and untouched by the claim.
 */

/** Prefixes on which a roll may happen. `/` matches the home page only. */
export const ELIGIBLE_ROUTE_PREFIXES = [
  "/",
  "/explore",
  "/inventory",
  "/items",
  "/market",
  "/shop",
  "/shops",
  "/activities",
  "/profile",
  "/history",
  "/u",
] as const;

/**
 * Carved back out of the allow-list. These are pages where an interrupting
 * modal would either destroy work in progress or arrive mid-transaction.
 */
export const EXCLUDED_ROUTE_PREFIXES = [
  // A form with unsaved bio/showcase edits.
  "/profile/edit",
] as const;

/**
 * `/hollow` is absent from the allow-list on purpose, not by oversight.
 *
 * Arranging a Hollow means a caption field with unsaved text and a series
 * of two-tap placements, which is the same "do not interrupt this" case
 * `/profile/edit` is carved out for — and the Hollow is meant to be the
 * one place in the game where nothing happens at you. If events are ever
 * wanted there, `/hollow/catalogue` is the page that could take them:
 * it is an ordinary browse with nothing in flight.
 */

/**
 * Trims the query string and fragment, collapses a trailing slash, and
 * rejects anything that is not a plain same-origin path. Returns null when
 * the value cannot be trusted as a route at all.
 */
export function normalizeRoutePath(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) {
    return null;
  }
  // Protocol-relative and absolute URLs are not routes of ours.
  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }
  const withoutQuery = raw.split("?")[0]?.split("#")[0] ?? "";
  if (withoutQuery === "" || withoutQuery.includes("\\")) {
    return null;
  }
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

function matchesPrefix(path: string, prefix: string): boolean {
  if (prefix === "/") {
    return path === "/";
  }
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** True when a roll is allowed on this route. */
export function isEligibleRoute(path: string): boolean {
  if (EXCLUDED_ROUTE_PREFIXES.some((prefix) => matchesPrefix(path, prefix))) {
    return false;
  }
  return ELIGIBLE_ROUTE_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

/** Whether an event's own `routePrefixes` rule admits this route. */
export function matchesAnyPrefix(path: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => matchesPrefix(path, prefix));
}
