"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { chooseStarter, StarterError } from "@/server/modules/pets/starter";
import { feedPet } from "@/server/modules/pets/feed-pet";
import { chooseStarterSchema, feedPetSchema } from "@/lib/validation";
import { failWith } from "./shared";

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
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result, replayed } = await feedPet(prisma, {
      userId: user.id,
      petId: parsed.data.petId,
      itemId: parsed.data.itemId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    // A replay is reported as a replay: claiming a second feeding happened
    // would be a lie about the player's inventory.
    notice = replayed
      ? `Already fed — ${result.itemName} was eaten a moment ago.`
      : `Yum! ${result.itemName} eaten.`;
  } catch (error) {
    failWith(returnTo, error, { op: "feed-pet", userId: user.id });
  }

  revalidatePath("/");
  revalidatePath("/inventory");
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}
