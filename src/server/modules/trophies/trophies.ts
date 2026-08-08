import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import {
  TROPHIES,
  TROPHY_GROUP_NAMES,
  trophyFor,
  type TrophyGroup,
} from "./catalogue";
import { gatherTrophyFacts } from "./facts";

/**
 * Awarding and reading trophies (ADR-65).
 *
 * **Trophies are worked out on demand, not awarded at the moment they are
 * earned.** The alternative would have meant a trophy hook inside twenty
 * domain modules — every one of them a place to forget one, and every one
 * of them a reason for a game rule to import a profile concern. Instead
 * the catalogue is evaluated against a snapshot of what the player has
 * actually done, and anything newly true is written down.
 *
 * That makes the whole thing idempotent by construction, impossible to
 * miss, and correct retroactively: a trophy added next month is earned by
 * everyone who already qualified, without a backfill.
 *
 * The cost is that `earnedAt` is when the game NOTICED, not the instant
 * the last request was completed. For a case of recognition on a profile
 * that is the right trade — and the sync runs whenever a player looks at
 * their own profile, which is the only place any of this is visible.
 */

export interface TrophyView {
  key: string;
  name: string;
  criteria: string;
  icon: string;
  group: TrophyGroup;
  groupName: string;
  /** Null when the viewer has not earned it. Only ever their own. */
  earnedAt: Date | null;
}

export interface TrophyCase {
  earned: TrophyView[];
  /** Empty for anybody but the owner — see `getPublicTrophyCase`. */
  unearned: TrophyView[];
}

function view(key: string, earnedAt: Date | null): TrophyView | null {
  const trophy = trophyFor(key);
  if (!trophy) return null;
  return {
    key: trophy.key,
    name: trophy.name,
    criteria: trophy.criteria,
    icon: trophy.icon,
    group: trophy.group,
    groupName: TROPHY_GROUP_NAMES[trophy.group],
    earnedAt,
  };
}

/**
 * Writes down any trophy the player has newly earned, and returns the keys
 * that were added.
 *
 * `createMany` with `skipDuplicates` against the unique (userId, trophyKey)
 * is the whole concurrency story: two tabs syncing at once both compute the
 * same set, and the second insert simply adds nothing.
 */
export async function syncTrophies(
  db: DbClient,
  userId: string,
): Promise<string[]> {
  const [facts, held] = await Promise.all([
    gatherTrophyFacts(db, userId),
    db.playerTrophy.findMany({
      where: { userId },
      select: { trophyKey: true },
    }),
  ]);

  const already = new Set(held.map((row) => row.trophyKey));
  const fresh = TROPHIES.filter(
    (trophy) => !already.has(trophy.key) && trophy.earned(facts),
  ).map((trophy) => trophy.key);
  if (fresh.length === 0) return [];

  await db.playerTrophy.createMany({
    data: fresh.map((trophyKey) => ({ userId, trophyKey })),
    skipDuplicates: true,
  });
  log.info("trophies.awarded", { userId, keys: fresh.join(",") });
  return fresh;
}

/**
 * The player's own case: everything they have, and everything they do not.
 *
 * Showing the unearned ones is what makes the case answer "what else is
 * there?" rather than only "what have I done?". Deliberately NOT a
 * completion percentage or an "x of y" — see docs/design-philosophy.md.
 * A player is being shown what exists, not how far short of it they are.
 */
export async function getOwnTrophyCase(
  db: DbClient,
  userId: string,
): Promise<TrophyCase> {
  await syncTrophies(db, userId);
  const held = await db.playerTrophy.findMany({
    where: { userId },
    select: { trophyKey: true, earnedAt: true },
  });
  const earnedAt = new Map(held.map((row) => [row.trophyKey, row.earnedAt]));

  const earned: TrophyView[] = [];
  const unearned: TrophyView[] = [];
  for (const trophy of TROPHIES) {
    const at = earnedAt.get(trophy.key) ?? null;
    const row = view(trophy.key, at);
    if (!row) continue;
    (at ? earned : unearned).push(row);
  }
  return { earned, unearned };
}

/**
 * Somebody else's case: what they have earned, and nothing else.
 *
 * No sync here. Awarding runs off the owner's own visit, so looking at a
 * profile stays four cheap reads — and a page anyone can load
 * unauthenticated must not be a way to make the server do twenty-five
 * aggregate queries on demand.
 *
 * `unearned` is empty rather than absent: a stranger's profile answers
 * "what have they done", not "what have they failed to do", and returning
 * the same shape means the component cannot accidentally render the
 * second. A presentation choice, not a privacy rule — ADR-67 withdrew the
 * rule that would have made it one.
 */
export async function getPublicTrophyCase(
  db: DbClient,
  { username }: { username: string },
): Promise<TrophyCase> {
  // By username, not by id. The public profile is the one page in the app
  // that renders for anybody, and it has no business handling an internal
  // user id in order to draw a shelf — the same reasoning as
  // `getPublicFondness`. Normalized, because that is what usernames are
  // matched on everywhere (docs/conventions.md).
  const held = await db.playerTrophy.findMany({
    where: { user: { normalizedUsername: username.toLowerCase() } },
    select: { trophyKey: true, earnedAt: true },
  });
  const earnedAt = new Map(held.map((row) => [row.trophyKey, row.earnedAt]));

  // Ordered by the catalogue rather than by when they were earned, so a
  // profile reads the same way as the owner's own case.
  const earned = TROPHIES.flatMap((trophy) => {
    const at = earnedAt.get(trophy.key);
    if (!at) return [];
    const row = view(trophy.key, at);
    return row ? [row] : [];
  });
  return { earned, unearned: [] };
}
