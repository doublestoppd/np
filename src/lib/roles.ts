import type { UserRole } from "@prisma/client";

/**
 * Ranking user roles. Pure and client-safe — the navigation needs to know
 * whether to show a moderator link, and the server needs to know whether to
 * let the action run, and they must not disagree.
 *
 * **Every check is "at least", never equality.** An administrator who could
 * not do a moderator's job would be a system where the person responsible
 * for the site cannot remove a post from it, and the only way to fix that
 * would be to hold two roles at once — which is how a role field becomes a
 * set of flags in disguise. So the order below is the whole model:
 *
 *   PLAYER < MODERATOR < ADMIN
 *
 * The reverse does NOT hold, and that is the point of having two. A
 * moderator acts on things people wrote: hiding a post, locking a thread,
 * closing a report. They cannot touch coins, item lifecycle, restocks, or
 * accounts. Moderation is a job you can hand to a trusted player without
 * handing them the economy.
 */

/** Least privileged first. Index in this array IS the rank. */
export const ROLE_ORDER = ["PLAYER", "MODERATOR", "ADMIN"] as const satisfies readonly UserRole[];

/**
 * Exhaustive by construction: a role added to the schema and not to
 * ROLE_ORDER fails to type-check here rather than silently ranking as
 * `-1` — which would read as "less privileged than a player" and quietly
 * lock the new role out of everything.
 */
const RANK: Record<UserRole, number> = {
  PLAYER: 0,
  MODERATOR: 1,
  ADMIN: 2,
};

/** True when `role` is `minimum` or anything above it. */
export function isAtLeast(role: UserRole, minimum: UserRole): boolean {
  return RANK[role] >= RANK[minimum];
}

/** Can act on user-submitted text: moderators and administrators. */
export function canModerate(role: UserRole): boolean {
  return isAtLeast(role, "MODERATOR");
}

/** Can act on the economy, accounts, and content lifecycle. */
export function isAdmin(role: UserRole): boolean {
  return isAtLeast(role, "ADMIN");
}

/** How a role is named to the person holding it. */
export const ROLE_LABELS: Record<UserRole, string> = {
  PLAYER: "Player",
  MODERATOR: "Moderator",
  ADMIN: "Administrator",
};
