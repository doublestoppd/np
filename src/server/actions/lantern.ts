"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { lookForLantern } from "@/server/modules/daily/lantern/hunt";
import { lanternLookSchema } from "@/lib/validation";
import { failWith, safeReturnTo } from "./shared";

/**
 * Looks for the lantern where the player is standing. The client sends
 * only the place and an idempotency key — whether that is a find, which
 * look it was, and what it pays are all decided server-side.
 */
export async function lookForLanternAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/");

  const parsed = lanternLookSchema.safeParse({
    locationId: formData.get("locationId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result, replayed } = await lookForLantern(prisma, {
      userId: user.id,
      locationId: parsed.data.locationId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    if (result.found) {
      // A replay is reported as a replay. Claiming a second find would be
      // a lie about the player's purse.
      notice = replayed
        ? `Already found — the lantern was at ${result.foundAtName}.`
        : `There it is. The lantern was at ${result.foundAtName}, and you found it on look ${result.lookNumber} for ${result.rewardCoins} coins.`;
    } else if (result.looksRemaining === 0) {
      // Out of looks is stated as an ending, not a failure: it moves at
      // midnight regardless and nothing carries over.
      notice = `Not here. That's your looking done for today — it moves again at midnight UTC.`;
    } else {
      // The consolation that makes three looks a game rather than a coin
      // toss: wrong place, but you now know which half of the world.
      const warmth = result.warmRegion
        ? "but you're in the right region"
        : "and it isn't in this region at all";
      notice = `Not at ${result.placeName} — ${warmth}. ${result.looksRemaining} look${result.looksRemaining === 1 ? "" : "s"} left.`;
    }
  } catch (error) {
    failWith(returnTo, error, { op: "lantern-look", userId: user.id });
  }

  revalidatePath("/");
  revalidatePath("/games");
  revalidatePath("/history");
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}
