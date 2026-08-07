import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Every tunable for page-view random events, in one place.
 *
 * All of them are overridable by environment variable so an operator can
 * retune pacing, or switch the whole system off, without a deploy
 * (docs/operations.md). Values are read per call rather than frozen at
 * module load so a restart is enough to pick up a change and tests can
 * vary them.
 */

function numberFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < min || raw > max) {
    return fallback;
  }
  return raw;
}

/** Master switch. `RANDOM_EVENTS_ENABLED=false` stops every roll. */
export function randomEventsEnabled(): boolean {
  return process.env.RANDOM_EVENTS_ENABLED !== "false";
}

/**
 * Chance that an eligible page view produces an event, in basis points.
 *
 * Deliberately kept separate from the weighted catalog: this answers "does
 * anything happen", the catalog answers "what". Conflating them would mean
 * retuning frequency every time an event is added.
 *
 * 800bp ≈ 1 in 12 eligible views. With the cooldown below, a normal
 * session yields at most a couple of events — often enough to be worth
 * looking up for, rare enough to stay a surprise.
 */
export function baseEventChanceBp(): number {
  return numberFromEnv("RANDOM_EVENT_CHANCE_BP", 800, 0, 10_000);
}

export const CHANCE_DENOMINATOR_BP = 10_000;

/**
 * Anti-duplicate window: the shortest gap between two roll ATTEMPTS.
 *
 * This is not gameplay pacing — it is the guard that collapses concurrent
 * tabs, React's development double-effect, and a client that retries into
 * a single attempt. Three seconds is long enough to absorb all of those
 * (they arrive within milliseconds) and short enough that a player
 * clicking briskly through the world still gets rolls.
 */
export function rollMinIntervalMs(): number {
  return numberFromEnv("RANDOM_EVENT_MIN_INTERVAL_MS", 3_000, 0, 600_000);
}

/**
 * Cooldown after a successful event, randomized in this range so the next
 * one is not predictable. During the cooldown the probability roll is
 * skipped entirely — no dice, no work.
 */
export function eventCooldownMinMs(): number {
  return numberFromEnv("RANDOM_EVENT_COOLDOWN_MIN_MS", 15 * 60_000, 0, 86_400_000);
}

export function eventCooldownMaxMs(): number {
  const min = eventCooldownMinMs();
  const max = numberFromEnv("RANDOM_EVENT_COOLDOWN_MAX_MS", 45 * 60_000, 0, 86_400_000);
  return Math.max(min, max);
}

/**
 * The daily ceiling on events that actually HAPPEN.
 *
 * Everything above bounds the gap between attempts; nothing bounded how
 * many attempts a day could contain. A page view is the trigger, and a
 * script can produce page views all night — measured, that is ~47 events
 * a day against a person's ~2, which is a 24× advantage on a faucet that
 * pays coins and items. ADR-28 reasoned that a lying client "only buys a
 * roll the player could have had by visiting an eligible page", which is
 * true per roll and skips the rate.
 *
 * A cap on outcomes bounds the faucet whatever the attempt rate. Six is
 * far above what the 15-45 minute cooldown yields a person in a normal
 * day, so it never binds on anyone playing; it simply removes the reason
 * to leave a script running.
 */
export function maxEventsPerGameDay(): number {
  return numberFromEnv("RANDOM_EVENT_DAILY_MAX", 6, 1, 1_000);
}

/**
 * Abuse bound on the endpoint itself, independent of the pacing above. A
 * client that ignores the anti-duplicate response and hammers the action
 * is rate-limited like any other authenticated mutation.
 */
const RULES = {
  "random-event-roll": {
    name: "random-event-roll",
    limit: 60,
    windowSeconds: 60,
  },
} satisfies Record<string, RateLimitRule>;

export type RandomEventRateLimitedOperation = keyof typeof RULES;

export async function enforceRandomEventRateLimit(
  db: DbClient,
  operation: RandomEventRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}
