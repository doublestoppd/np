"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import {
  leaveOnShelf,
  takeFromShelf,
} from "@/server/modules/giveaway/commands";
import { giveawayLeaveSchema, giveawayTakeSchema } from "@/lib/validation";
import { failWith, safeReturnTo } from "./shared";

/**
 * The Leaving Shelf's actions.
 *
 * The client's entire vocabulary is "this item, this many" and "this lot".
 * Nothing about who may give, who may take, how many are left in the day,
 * or whether a lot has gone cold is submitted or trusted — all of it is
 * decided inside the command's transaction.
 */

function refresh(returnTo: string): void {
  revalidatePath(returnTo);
  revalidatePath("/inventory");
  revalidatePath("/history");
}

export async function leaveOnShelfAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/");

  const parsed = giveawayLeaveSchema.safeParse({
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity") ?? 1,
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result, replayed } = await leaveOnShelf(prisma, {
      userId: user.id,
      itemId: parsed.data.itemId,
      quantity: parsed.data.quantity,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const what =
      result.quantity > 1
        ? `${result.quantity} × ${result.itemName}`
        : result.itemName;
    notice = replayed
      ? `Already on the shelf — ${what}.`
      : `${what} on the shelf. Somebody will be glad of it.`;
  } catch (error) {
    failWith(returnTo, error, { op: "giveaway-leave", userId: user.id });
  }

  refresh(returnTo);
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}

export async function takeFromShelfAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/");

  const parsed = giveawayTakeSchema.safeParse({
    offeringId: formData.get("offeringId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result, replayed } = await takeFromShelf(prisma, {
      userId: user.id,
      offeringId: parsed.data.offeringId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    // A replay is reported as a replay. Claiming a second copy would be a
    // lie about the satchel, and this is exactly the button a player
    // double-taps when the shelf feels like a race.
    notice = replayed
      ? `Already in your satchel — ${result.itemName}.`
      : `${result.itemName}, left by ${result.donorUsername}.`;
  } catch (error) {
    failWith(returnTo, error, { op: "giveaway-take", userId: user.id });
  }

  refresh(returnTo);
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}
