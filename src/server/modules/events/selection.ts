import { randomInt } from "node:crypto";
import { log } from "@/server/logging";
import { matchesAnyPrefix } from "./routes";
import type { RandomEventDefinition } from "./types";

/**
 * Which events may occur right now, and which one does.
 *
 * Kept apart from the roll so that "does anything happen" (a single
 * probability in config) never gets entangled with "what happens" (these
 * weights). Adding twenty events must not change how often events occur.
 */

export interface SelectionContext {
  /** Normalized route the player reported being on. */
  routePath: string;
  hasPet: boolean;
  accountAgeHours: number;
  /** Keys still inside their own per-event cooldown. */
  suppressedKeys: ReadonlySet<string>;
}

/** Applies enabled state, per-event cooldowns, and eligibility rules. */
export function eligibleEvents(
  catalog: readonly RandomEventDefinition[],
  context: SelectionContext,
): RandomEventDefinition[] {
  return catalog.filter((event) => {
    if (!event.enabled || event.weight <= 0) {
      return false;
    }
    if (context.suppressedKeys.has(event.key)) {
      return false;
    }
    const rules = event.eligibility;
    if (!rules) {
      return true;
    }
    if (rules.requiresPet && !context.hasPet) {
      return false;
    }
    if (
      rules.minAccountAgeHours !== undefined &&
      context.accountAgeHours < rules.minAccountAgeHours
    ) {
      return false;
    }
    if (
      rules.routePrefixes &&
      !matchesAnyPrefix(context.routePath, rules.routePrefixes)
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Picks one event by weight, using the same secure RNG the daily rewards
 * use — a player must not be able to precompute their own outcomes.
 *
 * Returns null rather than throwing on an empty or degenerate pool. A
 * catalog that filters down to nothing is a content problem, and the right
 * response is "no event happened" plus a loud log line, not a 500 on a
 * page view that the player did nothing wrong to trigger. Non-positive and
 * non-finite weights are dropped rather than trusted, so one bad entry
 * cannot skew or crash selection.
 */
export function selectEvent(
  pool: readonly RandomEventDefinition[],
): RandomEventDefinition | null {
  const usable = pool.filter(
    (event) => Number.isFinite(event.weight) && event.weight > 0,
  );
  if (usable.length === 0) {
    return null;
  }
  const total = usable.reduce((sum, event) => sum + event.weight, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }
  let roll = randomInt(0, Math.floor(total));
  for (const event of usable) {
    roll -= event.weight;
    if (roll < 0) {
      return event;
    }
  }
  // Reachable only through floating-point drift in the total; the last
  // entry is as fair an answer as any and beats returning nothing.
  return usable[usable.length - 1] ?? null;
}

/** Convenience wrapper that reports an empty pool once, with context. */
export function selectEligibleEvent(
  catalog: readonly RandomEventDefinition[],
  context: SelectionContext,
): RandomEventDefinition | null {
  const pool = eligibleEvents(catalog, context);
  const chosen = selectEvent(pool);
  if (!chosen) {
    log.warn("random-event.pool-empty", {
      routePath: context.routePath,
      hasPet: context.hasPet,
      catalogSize: catalog.length,
      poolSize: pool.length,
    });
  }
  return chosen;
}
