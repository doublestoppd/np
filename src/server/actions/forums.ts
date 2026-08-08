"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser, requireModerator } from "@/server/auth/session";
import {
  createPost,
  createThread,
  editPost,
  withdrawPost,
} from "@/server/modules/forums/commands";
import {
  dismissReport,
  removePost,
  reportPost,
  restorePost,
  setThreadFlag,
} from "@/server/modules/forums/moderation";
import {
  createPostSchema,
  createThreadSchema,
  editPostSchema,
  reportPostSchema,
  withdrawPostSchema,
  moderateSchema,
} from "@/lib/validation";
import { failWith, succeedWith } from "./shared";

/**
 * Forum server actions (ADR-56).
 *
 * Every one of these is a public endpoint reachable by anyone who knows
 * its id, so authority is re-checked here AND again inside the domain
 * command. The moderator actions gate through `requireModerator` before
 * they parse anything, and the domain refuses a bad role a second time —
 * belt and braces on the one surface where the cost of a mistake is
 * somebody deleting other people's words.
 *
 * Ordinary posting redirects rather than returning state: a new post
 * changes the page it appears on, and a redirect gets the reader to it
 * with the server's version of the thread rather than an optimistic one.
 */

function threadPath(threadId: string): string {
  return `/forums/t/${threadId}`;
}

export async function createThreadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = createThreadSchema.safeParse({
    boardSlug: formData.get("boardSlug"),
    title: formData.get("title"),
    body: formData.get("body"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "That post could not be sent.";
    redirect(
      `/forums/${encodeURIComponent(String(formData.get("boardSlug") ?? ""))}?error=${encodeURIComponent(message)}`,
    );
  }

  const board = `/forums/${parsed.data.boardSlug}`;
  let threadId: string;
  try {
    const { result } = await createThread(prisma, {
      userId: user.id,
      role: user.role,
      ...parsed.data,
    });
    threadId = result.threadId;
  } catch (error) {
    failWith(board, error, { op: "forum-thread-create", userId: user.id });
  }
  revalidatePath(board);
  revalidatePath("/forums");
  redirect(threadPath(threadId));
}

export async function createPostAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = createPostSchema.safeParse({
    threadId: formData.get("threadId"),
    body: formData.get("body"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "That post could not be sent.";
    redirect(
      `${threadPath(String(formData.get("threadId") ?? ""))}?error=${encodeURIComponent(message)}`,
    );
  }

  const where = threadPath(parsed.data.threadId);
  try {
    await createPost(prisma, { userId: user.id, ...parsed.data });
  } catch (error) {
    failWith(where, error, { op: "forum-post-create", userId: user.id });
  }
  revalidatePath(where);
  revalidatePath("/forums");
  // Straight to the end of the thread, which is where their reply is.
  redirect(`${where}?page=last#end`);
}

export async function editPostAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = editPostSchema.safeParse({
    postId: formData.get("postId"),
    body: formData.get("body"),
  });
  const back = threadPath(String(formData.get("threadId") ?? ""));
  if (!parsed.success) {
    redirect(
      `${back}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "That edit could not be saved.")}`,
    );
  }
  try {
    await editPost(prisma, { userId: user.id, ...parsed.data });
  } catch (error) {
    failWith(back, error, { op: "forum-post-edit", userId: user.id });
  }
  revalidatePath(back);
  succeedWith(back, "Edited.");
}

export async function withdrawPostAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = withdrawPostSchema.safeParse({
    postId: formData.get("postId"),
  });
  const back = threadPath(String(formData.get("threadId") ?? ""));
  if (!parsed.success) {
    redirect(`${back}?error=${encodeURIComponent("That could not be taken down.")}`);
  }
  let withdrewThread = false;
  try {
    const result = await withdrawPost(prisma, {
      userId: user.id,
      postId: parsed.data.postId,
    });
    withdrewThread = result.withdrewThread;
  } catch (error) {
    failWith(back, error, { op: "forum-post-withdraw", userId: user.id });
  }
  revalidatePath(back);
  revalidatePath("/forums");
  if (withdrewThread) {
    // The thread they were reading is gone, and it was theirs to remove.
    succeedWith("/forums", "Your thread has been taken down.");
  }
  succeedWith(back, "Taken down.");
}

export async function reportPostAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = reportPostSchema.safeParse({
    postId: formData.get("postId"),
    reason: formData.get("reason"),
  });
  const back = threadPath(String(formData.get("threadId") ?? ""));
  if (!parsed.success) {
    redirect(`${back}?error=${encodeURIComponent("That report could not be sent.")}`);
  }
  let filed = false;
  try {
    const result = await reportPost(prisma, {
      userId: user.id,
      postId: parsed.data.postId,
      reason: parsed.data.reason,
    });
    filed = result.filed;
  } catch (error) {
    failWith(back, error, { op: "forum-report", userId: user.id });
  }
  revalidatePath(back);
  succeedWith(
    back,
    filed
      ? "Reported. A moderator will look at it."
      : "You'd already reported that one — it's still on the pile.",
  );
}

/**
 * Every moderator action, behind one endpoint.
 *
 * One rather than six because they share an authority check and a return
 * path, and six near-identical actions is six places to forget
 * `requireModerator`. The intent is validated against a closed list, so
 * an unknown one is a parse failure rather than a fallthrough.
 */
export async function moderateAction(formData: FormData): Promise<void> {
  // BEFORE parsing: a player must not be able to tell a valid moderator
  // intent from an invalid one by the error they get back.
  const moderator = await requireModerator();
  const parsed = moderateSchema.safeParse({
    intent: formData.get("intent"),
    subjectId: formData.get("subjectId"),
    reason: formData.get("reason"),
  });
  const back = String(formData.get("returnTo") ?? "/forums/moderation");
  const safeBack = back.startsWith("/forums") ? back : "/forums/moderation";
  if (!parsed.success) {
    redirect(`${safeBack}?error=${encodeURIComponent("That isn't a moderator action.")}`);
  }

  const { intent, subjectId, reason } = parsed.data;
  const actor = { moderatorId: moderator.id, role: moderator.role, reason };
  try {
    switch (intent) {
      case "remove-post":
        await removePost(prisma, { ...actor, postId: subjectId });
        break;
      case "restore-post":
        await restorePost(prisma, { ...actor, postId: subjectId });
        break;
      case "lock-thread":
      case "unlock-thread":
        await setThreadFlag(prisma, {
          ...actor,
          threadId: subjectId,
          flag: "locked",
          value: intent === "lock-thread",
        });
        break;
      case "pin-thread":
      case "unpin-thread":
        await setThreadFlag(prisma, {
          ...actor,
          threadId: subjectId,
          flag: "pinned",
          value: intent === "pin-thread",
        });
        break;
      case "dismiss-report":
        await dismissReport(prisma, {
          moderatorId: moderator.id,
          role: moderator.role,
          reportId: subjectId,
          note: reason,
        });
        break;
    }
  } catch (error) {
    failWith(safeBack, error, { op: `forum-${intent}`, userId: moderator.id });
  }
  revalidatePath("/forums");
  revalidatePath("/forums/moderation");
  revalidatePath(safeBack);
  succeedWith(safeBack, "Done.");
}
