"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { chooseStarter, StarterError } from "@/server/modules/pets/starter";
import { feedPet } from "@/server/modules/pets/feed-pet";
import { playWithPet } from "@/server/modules/pets/play-with-pet";
import { readToPet } from "@/server/modules/pets/read-to-pet";
import { treatPet } from "@/server/modules/pets/treat-pet";
import { groomPet } from "@/server/modules/pets/groom-pet";
import { sitWithPet } from "@/server/modules/pets/sit-with-pet";
import { takeKeepsake } from "@/server/modules/pets/keepsakes";
import { describeReaction } from "@/lib/pet-reactions";
import {
  chooseStarterSchema,
  feedPetSchema,
  groomPetSchema,
  playWithPetSchema,
  readToPetSchema,
  sitWithPetSchema,
  takeKeepsakeSchema,
  treatPetSchema,
} from "@/lib/validation";
import { describeStat } from "@/lib/pet-condition";
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
    // The domain result carries raw stat values; they stop here. What the
    // player is told is the resulting state in words, from the one place
    // that owns that vocabulary (src/lib/pet-condition.ts).
    const appetite = describeStat("hunger", result.hunger).label;
    // A replay is reported as a replay: claiming a second feeding happened
    // would be a lie about the player's inventory.
    // The reaction is appended rather than replacing the notice: what the
    // companion thought of it does not make the appetite less true. It
    // never names the tag that caused it — see modules/pets/palate.ts.
    const reaction = describeReaction(result.reaction, "FOOD", {
      petName: result.petName,
      itemName: result.itemName,
    });
    notice = replayed
      ? `Already fed — ${result.itemName} was eaten a moment ago. ${appetite}.`
      : `Yum! ${result.itemName} eaten. ${appetite}.${reaction ? ` ${reaction}` : ""}`;
  } catch (error) {
    failWith(returnTo, error, { op: "feed-pet", userId: user.id });
  }

  revalidatePath("/");
  revalidatePath("/inventory");
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}

export async function playWithPetAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = formData.get("returnTo") === "/inventory" ? "/inventory" : "/";

  const parsed = playWithPetSchema.safeParse({
    petId: formData.get("petId"),
    itemId: formData.get("itemId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result, replayed } = await playWithPet(prisma, {
      userId: user.id,
      petId: parsed.data.petId,
      itemId: parsed.data.itemId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    // Words, not numbers: the raw stat stops at the domain boundary
    // (src/lib/pet-condition.ts owns the vocabulary).
    const spirits = describeStat("happiness", result.happiness).label;
    const reaction = describeReaction(result.reaction, "TOY", {
      petName: result.petName,
      itemName: result.itemName,
    });
    // Appended, not substituted — the same shape feeding uses. What the
    // companion made of the toy does not make its spirits less true, and
    // replacing the sentence would quietly drop the one line that tells a
    // player whether playing achieved anything.
    notice = replayed
      ? `Already played — ${result.petName} is ${spirits.toLowerCase()}.`
      : `${result.petName} played with the ${result.itemName}. ${spirits}.${reaction ? ` ${reaction}` : ""}`;
  } catch (error) {
    failWith(returnTo, error, { op: "play-with-pet", userId: user.id });
  }

  revalidatePath("/");
  revalidatePath("/inventory");
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}

/**
 * Reads one book aloud, consuming it.
 *
 * The notice leads with the title and what the companion made of it, and
 * only then mentions insight — the number is the smallest part of what
 * just happened, and a message that opened with "+18 insight" would make
 * it the largest.
 */
export async function readToPetAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = formData.get("returnTo") === "/inventory" ? "/inventory" : "/";

  const parsed = readToPetSchema.safeParse({
    petId: formData.get("petId"),
    itemId: formData.get("itemId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result, replayed } = await readToPet(prisma, {
      userId: user.id,
      petId: parsed.data.petId,
      itemId: parsed.data.itemId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const opening = replayed
      ? `Already read — ${result.bookName} went on the shelf a moment ago.`
      : result.firstTime
        ? `You read ${result.bookName} to ${result.petName}. It goes on the shelf.`
        : `You read ${result.bookName} again. ${result.petName} settles in for a familiar one.`;
    // A band change is the only time the meter is worth mentioning by
    // name; otherwise the shelf itself is the feedback.
    notice = result.bandChanged
      ? `${opening} ${result.petName} is now ${result.band.toLowerCase()}.`
      : opening;
  } catch (error) {
    failWith(returnTo, error, { op: "read-to-pet", userId: user.id });
  }

  revalidatePath("/");
  revalidatePath("/inventory");
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}

/**
 * Gives a remedy.
 *
 * The refusals are as much of the feature as the cure: offering the wrong
 * bottle, or one when nothing is the matter, consumes nothing and says so.
 */
export async function treatPetAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = formData.get("returnTo") === "/inventory" ? "/inventory" : "/";

  const parsed = treatPetSchema.safeParse({
    petId: formData.get("petId"),
    itemId: formData.get("itemId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result, replayed } = await treatPet(prisma, {
      userId: user.id,
      petId: parsed.data.petId,
      itemId: parsed.data.itemId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    notice = replayed
      ? `Already given — ${result.petName} is over the ${result.ailmentName.toLowerCase()}.`
      : `${result.itemName} settles it. ${result.petName} is over the ${result.ailmentName.toLowerCase()} and looks much more like themselves.`;
  } catch (error) {
    failWith(returnTo, error, { op: "treat-pet", userId: user.id });
  }

  revalidatePath("/");
  revalidatePath("/inventory");
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}

/** Brushes. The tool is kept; only the cooldown is spent. */
export async function groomPetAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = formData.get("returnTo") === "/inventory" ? "/inventory" : "/";

  const parsed = groomPetSchema.safeParse({
    petId: formData.get("petId"),
    itemId: formData.get("itemId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result, replayed } = await groomPet(prisma, {
      userId: user.id,
      petId: parsed.data.petId,
      itemId: parsed.data.itemId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    notice = replayed
      ? `Already done — ${result.petName} has had the ${result.itemName.toLowerCase()} over them.`
      : result.immaculate
        ? `${result.petName} is immaculate, and knows it.`
        : `A good going-over with the ${result.itemName.toLowerCase()}. ${result.petName} leans into it.`;
  } catch (error) {
    failWith(returnTo, error, { op: "groom-pet", userId: user.id });
  }

  revalidatePath("/");
  revalidatePath("/inventory");
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}

/**
 * Sits with them and does nothing else (ADR-61).
 *
 * The notice IS the feature — there is no meter worth mentioning here —
 * so the sentence the domain chose is passed through whole and nothing is
 * added to it. In particular no "+3 happiness": a number would tell the
 * player what the last half-hour was worth, and it was not worth three of
 * anything.
 */
export async function sitWithPetAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = formData.get("returnTo") === "/inventory" ? "/inventory" : "/";

  const parsed = sitWithPetSchema.safeParse({
    petId: formData.get("petId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result } = await sitWithPet(prisma, {
      userId: user.id,
      petId: parsed.data.petId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    // Replayed or not, the same sentence: a double tap did not produce a
    // second half-hour, and saying "already sat" would be correcting the
    // player over something that does not matter.
    notice = result.line;
  } catch (error) {
    failWith(returnTo, error, { op: "sit-with-pet", userId: user.id });
  }

  revalidatePath("/");
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}

/** Picks up what a companion left out (ADR-61). */
export async function takeKeepsakeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = formData.get("returnTo") === "/inventory" ? "/inventory" : "/";

  const parsed = takeKeepsakeSchema.safeParse({
    petId: formData.get("petId"),
    keepsakeId: formData.get("keepsakeId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }

  let notice: string;
  try {
    const { result, replayed } = await takeKeepsake(prisma, {
      userId: user.id,
      petId: parsed.data.petId,
      keepsakeId: parsed.data.keepsakeId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    notice = replayed
      ? `${result.itemName} is in the satchel.`
      : `${result.itemName}, from ${result.petName}. It goes in the satchel.`;
  } catch (error) {
    failWith(returnTo, error, { op: "take-keepsake", userId: user.id });
  }

  revalidatePath("/");
  revalidatePath("/inventory");
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}
