import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { recordSecurityEvent } from "@/server/security/audit";
import { normalizeUsername } from "./identity";

/**
 * The alpha bootstrap admin.
 *
 * Somebody has to be the first administrator, and there is no way to
 * promote an account through the product because promoting accounts is
 * itself an administrative act. Every system solves this with a bootstrap
 * of some kind; during alpha this one is a name in a constant.
 *
 * **This is deliberately temporary.** It exists because there are no real
 * users yet and the operator is the author. When the project starts
 * preserving external testers' data (the moment CLAUDE.md's pre-alpha
 * policy ends), this should be replaced by an explicit
 * `admin-cli user:promote` run once against a real account, and this
 * module deleted.
 *
 * ## The hole, stated plainly
 *
 * A hardcoded username means **whoever registers that username first gets
 * administrator**. If the name is unclaimed on a reachable deployment, it
 * is a free admin account for anyone who reads this file or guesses it.
 *
 * That is knowingly accepted for alpha and only for alpha: the deployment
 * is not public, there are no real users, and the database is disposable
 * by policy. It is NOT acceptable the moment either of those stops being
 * true. Sign-up is deliberately not blocked for this name, because
 * reserving it would also stop the operator claiming their own account
 * through the product — which is the entire point of the bootstrap.
 *
 * What does bound it:
 *
 * 1. **`ADMIN_BOOTSTRAP_USERNAMES` overrides the constant** (comma
 *    separated, or empty to disable entirely), so a deployment that is
 *    not the author's can set its own or turn it off without a code
 *    change.
 * 2. **Every promotion is audited** to SecurityEvent and logged at warn,
 *    so a promotion nobody expected is findable afterwards rather than
 *    silent.
 * 3. **Claiming the name early closes it.** Once the account exists, the
 *    unique constraint on `normalizedUsername` means nobody else can take
 *    it, and promotion is a no-op forever after.
 */

/** Normalised. Overridden by ADMIN_BOOTSTRAP_USERNAMES (comma-separated). */
const DEFAULT_BOOTSTRAP_USERNAMES = ["jbrodye"];

export function bootstrapAdminUsernames(): string[] {
  const configured = process.env.ADMIN_BOOTSTRAP_USERNAMES;
  const raw =
    configured === undefined
      ? DEFAULT_BOOTSTRAP_USERNAMES
      : configured.split(",");
  return raw
    .map((name) => normalizeUsername(name))
    .filter((name) => name.length > 0);
}

/** True when this username is reserved for the bootstrap administrator. */
export function isBootstrapAdminUsername(username: string): boolean {
  return bootstrapAdminUsernames().includes(normalizeUsername(username));
}

/**
 * Promotes the bootstrap account if this is one, and it is not already.
 *
 * A guarded `updateMany` rather than a read-then-write: in the steady
 * state — which is every sign-in after the first — it matches nothing and
 * writes nothing, so this costs one cheap indexed statement and never
 * races with itself.
 *
 * Called on sign-up and on sign-in. Sign-in matters as much as sign-up:
 * it is what promotes an account that already existed before this shipped,
 * without anybody going into the database by hand.
 */
export async function ensureBootstrapAdmin(
  db: DbClient,
  username: string,
): Promise<boolean> {
  const normalized = normalizeUsername(username);
  if (!isBootstrapAdminUsername(normalized)) {
    return false;
  }
  const promoted = await db.user.updateMany({
    where: { normalizedUsername: normalized, isAdmin: false },
    data: { isAdmin: true },
  });
  if (promoted.count === 0) {
    return false;
  }
  // Loud on purpose. An administrator appearing is the kind of event an
  // operator should be able to find afterwards, even when it was expected.
  log.warn("account.bootstrap-admin-promoted", { username: normalized });
  const user = await db.user.findUnique({
    where: { normalizedUsername: normalized },
    select: { id: true },
  });
  await recordSecurityEvent(db, {
    userId: user?.id ?? null,
    type: "admin-action",
    severity: "warning",
    message: `Bootstrap admin promoted: ${normalized}`,
    metadata: { username: normalized, reason: "alpha-bootstrap" },
  });
  return true;
}
