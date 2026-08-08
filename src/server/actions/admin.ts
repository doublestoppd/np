"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/auth/session";
import {
  clearThrottles,
  resetTodaysActivities,
  type ResetResult,
} from "@/server/modules/admin/debug";
import { adminGrantCoins } from "@/server/modules/admin/operations";
import { DomainError } from "@/server/errors";
import { correlationId, log } from "@/server/logging";
import { coinsFromInput, formatCoins } from "@/lib/money";
import { adminGrantCoinsSchema, adminResetSchema } from "@/lib/validation";

/**
 * Admin debug actions.
 *
 * Every one of these re-checks authority server-side through
 * `requireAdmin`. The screen being unreachable in the navigation is not a
 * permission model — a server action is a public endpoint, and the only
 * thing standing between a curious player and a reset button is this
 * check.
 */

function describe(result: ResetResult): string {
  const rows = Object.entries(result.cleared);
  if (rows.length === 0) {
    return "Nothing to clear — that player had no limits in the way.";
  }
  const summary = rows
    .map(([table, count]) => `${count} ${table.replace(/([A-Z])/g, " $1").toLowerCase().trim()}`)
    .join(", ");
  const rewound =
    result.coinsRewound === "0"
      ? ""
      : ` ${result.coinsRewound} coins taken back so the day can be earned again.`;
  return `Cleared ${summary}.${rewound}`;
}

/**
 * Resolves the named account the way sign-in does — by normalized
 * username, so "Jbrodye" and "jbrodye" are the same operator rather than
 * a missing account (docs/conventions.md, identity normalization).
 *
 * Returns `never` on failure: `redirect` throws, so callers may use the
 * result directly. Call it OUTSIDE a try block — the redirect signal is
 * an exception and a catch would swallow it.
 */
async function resolveTarget(
  username: string,
): Promise<{ id: string; username: string }> {
  const target = await prisma.user.findFirst({
    where: { normalizedUsername: username.trim().toLowerCase() },
    select: { id: true, username: true },
  });
  if (!target) {
    redirect(`/admin?error=${encodeURIComponent(`No account called "${username}".`)}`);
  }
  return target;
}

/** Reports a failure back to the screen, keeping the player in scope. */
function fail(error: unknown, adminId: string, op: string, username: string): never {
  if (!(error instanceof DomainError)) {
    log.error("action.failed", {
      op,
      userId: adminId,
      correlationId: correlationId(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const message =
    error instanceof DomainError
      ? error.publicMessage
      : "That didn't work. The log has the detail.";
  redirect(
    `/admin?username=${encodeURIComponent(username)}&error=${encodeURIComponent(message)}`,
  );
}

/** Back to the screen with the player still selected. */
function done(username: string, notice: string): never {
  revalidatePath("/admin");
  redirect(
    `/admin?username=${encodeURIComponent(username)}&notice=${encodeURIComponent(notice)}`,
  );
}

export async function adminResetAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = adminResetSchema.safeParse({
    username: formData.get("username"),
    scope: formData.get("scope"),
  });
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent("Invalid request.")}`);
  }

  const target = await resolveTarget(parsed.data.username);

  let notice: string;
  try {
    const result =
      parsed.data.scope === "today"
        ? await resetTodaysActivities(prisma, {
            actorId: admin.id,
            targetUserId: target.id,
          })
        : await clearThrottles(prisma, {
            actorId: admin.id,
            targetUserId: target.id,
          });
    notice = `${target.username}: ${describe(result)}`;
  } catch (error) {
    fail(error, admin.id, "admin-reset", target.username);
  }

  done(target.username, notice);
}

/**
 * Puts coins in a player's wallet, for testing the things coins are for.
 *
 * This is the one tool on the screen that MINTS rather than rewinds, and
 * it is deliberately built on the same audited command the operator CLI
 * uses (`adminGrantCoins`) rather than a second path: the wallet credit
 * and the ledger row happen in one transaction, so reconciliation — which
 * this very page runs on every load — stays clean. A grant that touched
 * the wallet alone would light up the invariant check three lines below
 * the button that caused it.
 *
 * There is deliberately no matching "take coins away". A debit has to be
 * guarded against a wallet that has already spent the money, and a debug
 * tool that can leave a balance negative or a ledger lying is worse than
 * one that only goes up. To undo a grant, rewind the account by hand.
 */
export async function adminGrantCoinsAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = adminGrantCoinsSchema.safeParse({
    username: formData.get("username"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) {
    redirect(
      `/admin?username=${encodeURIComponent(String(formData.get("username") ?? ""))}` +
        `&error=${encodeURIComponent("Enter a whole number of coins between 1 and 1,000,000,000.")}`,
    );
  }

  const target = await resolveTarget(parsed.data.username);
  const amount = coinsFromInput(parsed.data.amount);

  try {
    await adminGrantCoins(prisma, admin.id, {
      username: target.username,
      amount,
    });
  } catch (error) {
    fail(error, admin.id, "admin-grant-coins", target.username);
  }

  done(
    target.username,
    `${target.username}: ${formatCoins(amount)} coins granted. It is in their history as an adjustment.`,
  );
}
