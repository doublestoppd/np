"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { chooseStarter, StarterError } from "@/server/services/starter";
import { feedPet, FeedError } from "@/server/services/feed-pet";
import { chooseStarterSchema, feedPetSchema } from "@/lib/validation";

const FEED_ERROR_MESSAGES: Record<string, string> = {
  PET_NOT_FOUND: "That pet could not be found.",
  ITEM_NOT_FOUND: "That item could not be found.",
  NOT_FOOD: "Only food can be fed to a pet.",
  NO_ITEM_IN_INVENTORY: "You have none of that item left.",
};

export async function chooseStarterAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = chooseStarterSchema.safeParse({
    speciesSlug: formData.get("speciesSlug"),
    petName: formData.get("petName"),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    redirect(`/starter?error=${encodeURIComponent(message)}`);
  }

  try {
    await chooseStarter(prisma, {
      userId: user.id,
      speciesSlug: parsed.data.speciesSlug,
      petName: parsed.data.petName,
    });
  } catch (error) {
    if (error instanceof StarterError) {
      if (error.code === "ALREADY_HAS_PET") {
        redirect("/");
      }
      redirect(
        `/starter?error=${encodeURIComponent("Choose one of the companions.")}`,
      );
    }
    throw error;
  }

  revalidatePath("/");
  redirect("/");
}

export async function feedPetAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = formData.get("returnTo") === "/inventory" ? "/inventory" : "/";

  const parsed = feedPetSchema.safeParse({
    petId: formData.get("petId"),
    itemId: formData.get("itemId"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  try {
    const result = await feedPet(prisma, {
      userId: user.id,
      petId: parsed.data.petId,
      itemId: parsed.data.itemId,
    });
    revalidatePath("/");
    revalidatePath("/inventory");
    redirect(
      `${returnTo}?notice=${encodeURIComponent(`Yum! ${result.itemName} eaten.`)}`,
    );
  } catch (error) {
    if (error instanceof FeedError) {
      const message = FEED_ERROR_MESSAGES[error.code] ?? "Feeding failed.";
      redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
    }
    throw error;
  }
}
