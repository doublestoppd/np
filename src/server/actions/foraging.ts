"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { searchSpot } from "@/server/modules/foraging/search";
import { searchSpotSchema } from "@/lib/validation";
import { failWith, safeReturnTo } from "./shared";

/**
 * Searches a foraging spot. The client sends only which spot and an
 * idempotency key — what is found, how much of it, and whether there was
 * a search left today are all decided server-side.
 */
export async function searchSpotAction(formData: FormData): Promise<void> {
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
    const { result, replayed } = await searchSpot(prisma, {
      userId: user.id,
      spotSlug: parsed.data.spotSlug,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    if (result.found === null) {
      // An empty-handed look still says something. It also still used one
      // of the day's searches, so it is never silently retried.
      notice = result.flavor;
    } else {
      const what =
        result.found.quantity > 1
          ? `${result.found.quantity} × ${result.found.itemName}`
          : result.found.itemName;
      // A replay is reported as a replay: claiming a second find would be
      // a lie about the player's satchel.
      notice = replayed ? `Already pocketed — ${what}.` : `You found ${what}.`;
    }
  } catch (error) {
    failWith(returnTo, error, { op: "forage-search", userId: user.id });
  }

  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/history");
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}
