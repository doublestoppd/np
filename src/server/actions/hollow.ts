"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import {
  clearAnchor,
  moveFurnishing,
  moveScene,
  placeFurnishing,
  purchaseAir,
  purchaseFurnishing,
  purchaseGround,
  setSceneAir,
  setSceneCaption,
} from "@/server/modules/hollow/commands";
import {
  hollowAnchorSchema,
  hollowCaptionSchema,
  hollowMoveSceneSchema,
  hollowMoveSchema,
  hollowPlaceSchema,
  hollowPurchaseAirSchema,
  hollowPurchaseFurnishingSchema,
  hollowPurchaseGroundSchema,
  hollowSetAirSchema,
} from "@/lib/validation";
import { coinsFromJSON, formatCoins } from "@/lib/money";
import { failWith } from "./shared";

/**
 * Hollow actions. Each one authenticates, parses, calls a single command,
 * and redirects — no rules live here.
 *
 * Every action redirects with a notice, including the ones that move no
 * coins. Arranging used to redirect bare, so a player who put something
 * down, took it away, or changed the light was told nothing at all — the
 * page simply went quiet, and the only way to confirm anything had
 * happened was to hunt for the scene description and read it again.
 *
 * Every id and key the client sends is looked up against the caller's own
 * Hollow inside the command's transaction. A scene id from somebody else's
 * account is not an authorization decision made here; it simply does not
 * resolve there.
 */

const HOLLOW = "/hollow";
const CATALOGUE = "/hollow/catalogue";

function refresh(username: string): void {
  revalidatePath(HOLLOW);
  revalidatePath(CATALOGUE);
  revalidatePath(`/u/${username}`);
  revalidatePath(`/u/${username}/hollow`);
}

export async function buyFurnishingAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = hollowPurchaseFurnishingSchema.safeParse({
    slug: formData.get("slug"),
    quantity: formData.get("quantity") ?? 1,
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${CATALOGUE}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result, replayed } = await purchaseFurnishing(prisma, {
      userId: user.id,
      slug: parsed.data.slug,
      quantity: parsed.data.quantity,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const spent = formatCoins(coinsFromJSON(result.spent));
    notice = replayed
      ? "Already bought — it's in your satchel."
      : `Bought ${result.quantity > 1 ? `${result.quantity} × ` : ""}${parsed.data.slug.replace(/-/g, " ")} for ${spent}. It's in your satchel.`;
  } catch (error) {
    failWith(CATALOGUE, error, { op: "hollow-furnishing", userId: user.id });
  }

  refresh(user.username);
  revalidatePath("/inventory");
  revalidatePath("/history");
  redirect(`${CATALOGUE}?notice=${encodeURIComponent(notice)}`);
}

export async function buyGroundAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = hollowPurchaseGroundSchema.safeParse({
    groundKey: formData.get("groundKey"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${HOLLOW}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result, replayed } = await purchaseGround(prisma, {
      userId: user.id,
      groundKey: parsed.data.groundKey,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    notice = replayed
      ? "That ground is already yours."
      : `${result.groundKey.replace(/-/g, " ")} is yours. There's nothing standing on it yet.`;
  } catch (error) {
    failWith(HOLLOW, error, { op: "hollow-ground", userId: user.id });
  }

  refresh(user.username);
  revalidatePath("/history");
  redirect(`${HOLLOW}?notice=${encodeURIComponent(notice)}`);
}

export async function buyAirAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = hollowPurchaseAirSchema.safeParse({
    airKey: formData.get("airKey"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${HOLLOW}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { replayed } = await purchaseAir(prisma, {
      userId: user.id,
      airKey: parsed.data.airKey,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    notice = replayed
      ? "You already have that air."
      : "The light has changed. Try it on everything.";
  } catch (error) {
    failWith(HOLLOW, error, { op: "hollow-air", userId: user.id });
  }

  refresh(user.username);
  revalidatePath("/history");
  redirect(`${HOLLOW}?notice=${encodeURIComponent(notice)}`);
}

export async function placeFurnishingAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = hollowPlaceSchema.safeParse({
    sceneId: formData.get("sceneId"),
    anchorKey: formData.get("anchorKey"),
    slug: formData.get("slug"),
  });
  if (!parsed.success) {
    redirect(`${HOLLOW}?error=${encodeURIComponent("Invalid request.")}`);
  }

  try {
    await placeFurnishing(prisma, { userId: user.id, ...parsed.data });
  } catch (error) {
    failWith(HOLLOW, error, { op: "hollow-place", userId: user.id });
  }
  refresh(user.username);
  redirect(
    `${HOLLOW}?notice=${encodeURIComponent("Set down. It looks like it has been there a while.")}`,
  );
}

export async function clearAnchorAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = hollowAnchorSchema.safeParse({
    sceneId: formData.get("sceneId"),
    anchorKey: formData.get("anchorKey"),
  });
  if (!parsed.success) {
    redirect(`${HOLLOW}?error=${encodeURIComponent("Invalid request.")}`);
  }

  try {
    await clearAnchor(prisma, { userId: user.id, ...parsed.data });
  } catch (error) {
    failWith(HOLLOW, error, { op: "hollow-clear", userId: user.id });
  }
  refresh(user.username);
  redirect(
    `${HOLLOW}?notice=${encodeURIComponent("Put away. It's back in your satchel.")}`,
  );
}

export async function moveFurnishingAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = hollowMoveSchema.safeParse({
    fromSceneId: formData.get("fromSceneId"),
    fromAnchorKey: formData.get("fromAnchorKey"),
    toSceneId: formData.get("toSceneId"),
    toAnchorKey: formData.get("toAnchorKey"),
  });
  if (!parsed.success) {
    redirect(`${HOLLOW}?error=${encodeURIComponent("Invalid request.")}`);
  }

  try {
    await moveFurnishing(prisma, { userId: user.id, ...parsed.data });
  } catch (error) {
    failWith(HOLLOW, error, { op: "hollow-move", userId: user.id });
  }
  refresh(user.username);
  redirect(
    `${HOLLOW}?notice=${encodeURIComponent("Moved. It carried on from where it was.")}`,
  );
}

export async function setSceneAirAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = hollowSetAirSchema.safeParse({
    sceneId: formData.get("sceneId"),
    airKey: formData.get("airKey"),
  });
  if (!parsed.success) {
    redirect(`${HOLLOW}?error=${encodeURIComponent("Invalid request.")}`);
  }

  try {
    await setSceneAir(prisma, { userId: user.id, ...parsed.data });
  } catch (error) {
    failWith(HOLLOW, error, { op: "hollow-set-air", userId: user.id });
  }
  refresh(user.username);
  redirect(
    `${HOLLOW}?notice=${encodeURIComponent("The light has changed.")}`,
  );
}

export async function setCaptionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = hollowCaptionSchema.safeParse({
    sceneId: formData.get("sceneId"),
    caption: formData.get("caption") ?? "",
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request.";
    redirect(`${HOLLOW}?error=${encodeURIComponent(message)}`);
  }

  try {
    await setSceneCaption(prisma, { userId: user.id, ...parsed.data });
  } catch (error) {
    failWith(HOLLOW, error, { op: "hollow-caption", userId: user.id });
  }
  refresh(user.username);
  redirect(`${HOLLOW}?notice=${encodeURIComponent("Caption saved.")}`);
}

export async function moveSceneAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = hollowMoveSceneSchema.safeParse({
    sceneId: formData.get("sceneId"),
    direction: formData.get("direction"),
  });
  if (!parsed.success) {
    redirect(`${HOLLOW}?error=${encodeURIComponent("Invalid request.")}`);
  }

  try {
    await moveScene(prisma, { userId: user.id, ...parsed.data });
  } catch (error) {
    failWith(HOLLOW, error, { op: "hollow-move-scene", userId: user.id });
  }
  refresh(user.username);
  redirect(
    `${HOLLOW}?notice=${encodeURIComponent("Reordered. Visitors walk through in that order now.")}`,
  );
}
