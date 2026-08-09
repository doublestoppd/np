"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { saveShrine } from "@/server/modules/shrine/shrine";
import { setRingMembership } from "@/server/modules/shrine/webring";
import {
  hideGuestbookEntry,
  signGuestbook,
} from "@/server/modules/shrine/guestbook";
import {
  guestbookHideSchema,
  guestbookSignSchema,
  shrineSaveSchema,
} from "@/lib/validation";
import { correlationId, log } from "@/server/logging";
import { DomainError } from "@/server/errors";
import { publicErrorMessage } from "./shared";

/**
 * Decorating a Shrine, and signing somebody else's (ADR-69).
 *
 * The author of a guestbook entry is `requireUser()`, never anything in the
 * form. The shrine being edited is the signed-in player's own, looked up by
 * their id — the form does not get to say whose page it is saving.
 */

export interface ShrineSaveState {
  ok: boolean;
  error: string | null;
  nonce: number;
}

export async function saveShrineAction(
  previous: ShrineSaveState,
  formData: FormData,
): Promise<ShrineSaveState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;

  const parsed = shrineSaveSchema.safeParse({
    theme: formData.get("theme"),
    effect: formData.get("effect"),
    tune: formData.get("tune"),
    inRing: formData.get("inRing") === "on",
    banner: formData.get("banner") ?? "",
    blink: formData.get("blink") === "on",
    body: formData.get("body") ?? "",
    stickers: formData.getAll("stickers").map(String),
    published: formData.get("published") === "on",
    guestbookOpen: formData.get("guestbookOpen") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request.", nonce };
  }

  try {
    await saveShrine(prisma, { userId: user.id, draft: parsed.data });
    // After the save, so joining and publishing in the same submission
    // works: the ring refuses an unpublished shrine, and at this point it
    // is published.
    await setRingMembership(prisma, {
      userId: user.id,
      join: parsed.data.inRing && parsed.data.published,
    });
    revalidatePath("/profile/shrine");
    revalidatePath(`/u/${user.username}/shrine`);
    revalidatePath(`/u/${user.username}`);
    return { ok: true, error: null, nonce };
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log.error("action.failed", {
        correlationId: correlationId(),
        op: "shrine-save",
        userId: user.id,
        error:
          error instanceof Error ? error.message.slice(0, 200) : String(error),
      });
    }
    return { ok: false, error: publicErrorMessage(error), nonce };
  }
}

export interface GuestbookState {
  ok: boolean;
  error: string | null;
  nonce: number;
}

export async function signGuestbookAction(
  previous: GuestbookState,
  formData: FormData,
): Promise<GuestbookState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;

  const parsed = guestbookSignSchema.safeParse({
    shrineId: formData.get("shrineId"),
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Write something first.", nonce };
  }

  try {
    await signGuestbook(prisma, {
      shrineId: parsed.data.shrineId,
      authorId: user.id,
      body: parsed.data.body,
    });
    const owner = formData.get("owner");
    if (typeof owner === "string" && owner) {
      revalidatePath(`/u/${owner}/shrine`);
    }
    return { ok: true, error: null, nonce };
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log.error("action.failed", {
        correlationId: correlationId(),
        op: "shrine-sign",
        userId: user.id,
        error:
          error instanceof Error ? error.message.slice(0, 200) : String(error),
      });
    }
    return { ok: false, error: publicErrorMessage(error), nonce };
  }
}

export async function hideGuestbookEntryAction(
  previous: GuestbookState,
  formData: FormData,
): Promise<GuestbookState> {
  const user = await requireUser();
  const nonce = previous.nonce + 1;

  const parsed = guestbookHideSchema.safeParse({
    entryId: formData.get("entryId"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request.", nonce };
  }

  try {
    await hideGuestbookEntry(prisma, {
      entryId: parsed.data.entryId,
      actorId: user.id,
      actorRole: user.role,
    });
    const owner = formData.get("owner");
    if (typeof owner === "string" && owner) {
      revalidatePath(`/u/${owner}/shrine`);
    }
    return { ok: true, error: null, nonce };
  } catch (error) {
    if (!(error instanceof DomainError)) {
      log.error("action.failed", {
        correlationId: correlationId(),
        op: "shrine-hide",
        userId: user.id,
        error:
          error instanceof Error ? error.message.slice(0, 200) : String(error),
      });
    }
    return { ok: false, error: publicErrorMessage(error), nonce };
  }
}
