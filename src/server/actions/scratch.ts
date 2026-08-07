"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { scratchCard } from "@/server/modules/scratch/scratch";
import { scratchCardSchema } from "@/lib/validation";
import { failWith, safeReturnTo } from "./shared";

/**
 * Scratches one chit. The client names the card and provides an
 * idempotency key; what is under the salt is drawn on the server.
 */
export async function scratchCardAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/inventory");

  const parsed = scratchCardSchema.safeParse({
    itemId: formData.get("itemId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { outcome, replayed } = await scratchCard(prisma, {
      userId: user.id,
      itemId: parsed.data.itemId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const won =
      outcome.kind === "COINS"
        ? `${outcome.coins} coins`
        : outcome.quantity > 1
          ? `${outcome.quantity} × ${outcome.itemName}`
          : outcome.itemName;
    // A replay says so. Reporting a second win for one chit would be a
    // lie about both the satchel and the purse.
    notice = replayed
      ? `Already scratched — ${outcome.label}: ${won}.`
      : `${outcome.label} — ${won}.`;
  } catch (error) {
    failWith(returnTo, error, { op: "scratch-card", userId: user.id });
  }

  revalidatePath("/inventory");
  revalidatePath("/history");
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}
