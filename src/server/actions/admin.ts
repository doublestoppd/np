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
import { DomainError } from "@/server/errors";
import { correlationId, log } from "@/server/logging";
import { adminResetSchema } from "@/lib/validation";

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

export async function adminResetAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = adminResetSchema.safeParse({
    username: formData.get("username"),
    scope: formData.get("scope"),
  });
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent("Invalid request.")}`);
  }

  const target = await prisma.user.findFirst({
    where: { normalizedUsername: parsed.data.username.trim().toLowerCase() },
    select: { id: true, username: true },
  });
  if (!target) {
    redirect(
      `/admin?error=${encodeURIComponent(`No account called "${parsed.data.username}".`)}`,
    );
  }

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
    if (!(error instanceof DomainError)) {
      log.error("action.failed", {
        op: "admin-reset",
        userId: admin.id,
        correlationId: correlationId(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const message =
      error instanceof DomainError
        ? error.publicMessage
        : "That didn't work. The log has the detail.";
    redirect(
      `/admin?username=${encodeURIComponent(target.username)}&error=${encodeURIComponent(message)}`,
    );
  }

  revalidatePath("/admin");
  redirect(
    `/admin?username=${encodeURIComponent(target.username)}&notice=${encodeURIComponent(notice)}`,
  );
}
