"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { updateProfile } from "@/server/modules/profiles/profile";
import {
  addShowcaseItem,
  moveShowcaseItem,
  removeShowcaseItem,
} from "@/server/modules/profiles/showcase";
import {
  profileUpdateSchema,
  showcaseItemSchema,
  showcaseMoveSchema,
} from "@/lib/validation";
import { failWith, isRedirectError } from "./shared";

const EDITOR = "/profile/edit";

function revalidateProfiles(username: string): void {
  revalidatePath("/profile");
  revalidatePath(EDITOR);
  revalidatePath(`/u/${username}`);
}

export async function updateProfileAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = profileUpdateSchema.safeParse({
    title: formData.get("title") ?? "",
    bio: formData.get("bio") ?? "",
    featuredPetId: formData.get("featuredPetId") ?? "",
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    redirect(`${EDITOR}?error=${encodeURIComponent(message)}`);
  }

  try {
    await updateProfile(prisma, { userId: user.id, ...parsed.data });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    // Domain errors carry their own player-safe copy; anything else is
    // logged and reported generically.
    failWith(EDITOR, error, { op: "update-profile", userId: user.id });
  }

  revalidateProfiles(user.username);
  redirect(`${EDITOR}?notice=${encodeURIComponent("Profile saved.")}`);
}

async function runShowcaseAction(
  operation: () => Promise<void>,
  successNotice?: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith(EDITOR, error, { op: "showcase-change" });
  }
  const suffix = successNotice
    ? `?notice=${encodeURIComponent(successNotice)}`
    : "";
  redirect(`${EDITOR}${suffix}`);
}

export async function addShowcaseItemAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const parsed = showcaseItemSchema.safeParse({
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) {
    redirect(`${EDITOR}?error=${encodeURIComponent("Invalid request.")}`);
  }
  const instanceRaw = formData.get("itemInstanceId");
  const itemInstanceId =
    typeof instanceRaw === "string" && instanceRaw !== "" ? instanceRaw : null;
  await runShowcaseAction(async () => {
    await addShowcaseItem(prisma, {
      userId: user.id,
      itemId: parsed.data.itemId,
      itemInstanceId,
    });
    revalidateProfiles(user.username);
  });
}

export async function removeShowcaseItemAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const parsed = showcaseItemSchema.safeParse({
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) {
    redirect(`${EDITOR}?error=${encodeURIComponent("Invalid request.")}`);
  }
  await runShowcaseAction(async () => {
    await removeShowcaseItem(prisma, {
      userId: user.id,
      itemId: parsed.data.itemId,
    });
    revalidateProfiles(user.username);
  });
}

export async function moveShowcaseItemAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const parsed = showcaseMoveSchema.safeParse({
    itemId: formData.get("itemId"),
    direction: formData.get("direction"),
  });
  if (!parsed.success) {
    redirect(`${EDITOR}?error=${encodeURIComponent("Invalid request.")}`);
  }
  await runShowcaseAction(async () => {
    await moveShowcaseItem(prisma, {
      userId: user.id,
      itemId: parsed.data.itemId,
      direction: parsed.data.direction,
    });
    revalidateProfiles(user.username);
  });
}
