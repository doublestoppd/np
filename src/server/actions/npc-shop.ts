"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { purchaseFromNpcShop } from "@/server/modules/commerce/npc-shops/purchase";
import { npcPurchaseSchema } from "@/lib/validation";
import { coinsFromJSON, formatCoins } from "@/lib/money";
import { failWith, isRedirectError, safeReturnTo, succeedWith } from "./shared";

export async function purchaseNpcStockAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/explore");
  const parsed = npcPurchaseSchema.safeParse({
    stockId: formData.get("stockId"),
    quantity: formData.get("quantity") ?? 1,
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }
  try {
    const { result, replayed } = await purchaseFromNpcShop(prisma, {
      userId: user.id,
      ...parsed.data,
    });
    revalidatePath(returnTo);
    revalidatePath("/inventory");
    succeedWith(
      returnTo,
      replayed
        ? `Already bought — ${result.quantity} × ${result.itemName} is in your satchel.`
        : `Bought ${result.quantity} × ${result.itemName} for ${formatCoins(coinsFromJSON(result.totalPrice))} coins.`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith(returnTo, error, { op: "purchase-npc-stock", userId: user.id });
  }
}
