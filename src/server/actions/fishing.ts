"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { castLine } from "@/server/modules/fishing/cast";
import { searchSpotSchema } from "@/lib/validation";
import { failWith, safeReturnTo } from "./shared";

/**
 * Casts at a fishing spot. The client sends only which water and an
 * idempotency key — what bites, how big it is, and whether there was a
 * cast left today are all server decisions.
 */
export async function castLineAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/");

  const parsed = searchSpotSchema.safeParse({
    spotSlug: formData.get("spotSlug"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result, replayed } = await castLine(prisma, {
      userId: user.id,
      spotSlug: parsed.data.spotSlug,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    if (result.itemName === null) {
      // An empty cast still used one of the day's casts, so it is never
      // silently retried — and it still says something.
      notice = result.flavor;
    } else {
      const caught = `${result.itemName}, ${result.lengthCm}cm`;
      const best = result.personalBest
        ? result.previousBestCm === null
          ? " — your first one."
          : ` — your longest yet, up from ${result.previousBestCm}cm.`
        : "";
      notice = replayed
        ? `Already landed — ${caught}.`
        : `${caught}${best}`;
    }
  } catch (error) {
    failWith(returnTo, error, { op: "fishing-cast", userId: user.id });
  }

  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/history");
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}
