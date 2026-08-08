/**
 * Moderation (ADR-56).
 *
 * The cases here are the ones where a mistake is invisible rather than
 * loud: an edit outrunning a report, a trail with a gap in it, a
 * moderator quietly un-withdrawing something its author took back, and a
 * player reaching a moderator-only function directly.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createPost, createThread, editPost, withdrawPost } from "./commands";
import {
  dismissReport,
  getModerationTrail,
  getReportQueue,
  removePost,
  reportPost,
  restorePost,
  setThreadFlag,
} from "./moderation";
import { getThreadPage } from "./queries";
import { EDIT_WINDOW_MINUTES } from "./config";
import { ForumError } from "./errors";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

describe.skipIf(!testDb)("forum moderation (integration)", () => {
  const db = testDb as PrismaClient;
  const prefix = fixturePrefix("modn");
  let authorId = "";
  let reporterId = "";
  let modId = "";

  async function expectForumError(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toBeInstanceOf(ForumError);
    await promise.catch((error: ForumError) => {
      expect(error.forumCode).toBe(code);
    });
  }

  /** A thread with one reply, and the reply's id. */
  async function threadWithReply(body = "the reply as posted") {
    const { result: thread } = await createThread(db, {
      userId: authorId,
      role: "PLAYER",
      boardSlug: "general",
      title: `Thread ${randomUUID().slice(0, 8)}`,
      body: "opening",
      idempotencyKey: randomUUID(),
    });
    const { result: reply } = await createPost(db, {
      userId: authorId,
      threadId: thread.threadId,
      body,
      idempotencyKey: randomUUID(),
    });
    return { threadId: thread.threadId, postId: reply.postId };
  }

  beforeEach(async () => {
    authorId = (
      await createTestUser(db, { username: `${prefix}_a_${randomUUID().slice(0, 8)}` })
    ).id;
    reporterId = (
      await createTestUser(db, { username: `${prefix}_r_${randomUUID().slice(0, 8)}` })
    ).id;
    modId = (
      await createTestUser(db, {
        username: `${prefix}_m_${randomUUID().slice(0, 8)}`,
        role: "MODERATOR",
      })
    ).id;
  });

  afterAll(async () => {
    const authors = { author: { normalizedUsername: { startsWith: prefix } } };
    await db.moderationAction.deleteMany({
      where: { moderator: { normalizedUsername: { startsWith: prefix } } },
    });
    await db.forumReport.deleteMany({
      where: { reporter: { normalizedUsername: { startsWith: prefix } } },
    });
    await db.forumPost.deleteMany({ where: authors });
    await db.forumThread.deleteMany({ where: authors });
    await cleanupTestUsers(db, prefix);
    await db.$disconnect();
  });

  /**
   * The hole a snapshot closes. Post something, get reported, edit it
   * into something harmless — without the snapshot the moderator opens
   * the queue and finds nothing wrong.
   */
  it("shows the moderator what the reporter saw, not what it says now", async () => {
    const { postId } = await threadWithReply("the objectionable thing");
    await reportPost(db, {
      userId: reporterId,
      postId,
      reason: "not on",
    });
    await editPost(db, {
      userId: authorId,
      postId,
      body: "a perfectly nice sentence",
    });

    const queue = await getReportQueue(db, { role: "MODERATOR" });
    const entry = queue.find((row) => row.postId === postId);
    expect(entry?.bodyAtReport).toBe("the objectionable thing");
    expect(entry?.bodyNow).toBe("a perfectly nice sentence");
    // And it is flagged, so the moderator does not have to compare by eye.
    expect(entry?.edited).toBe(true);
  });

  it("treats a second report from the same person as the same report", async () => {
    const { postId } = await threadWithReply();
    const first = await reportPost(db, {
      userId: reporterId,
      postId,
      reason: "first",
    });
    const again = await reportPost(db, {
      userId: reporterId,
      postId,
      reason: "second thoughts",
    });
    expect(first.filed).toBe(true);
    expect(again.filed).toBe(false);
    expect(again.reportId).toBe(first.reportId);
    expect(await db.forumReport.count({ where: { postId } })).toBe(1);
  });

  it("sends someone reporting their own post to withdraw instead", async () => {
    const { postId } = await threadWithReply();
    await expectForumError(
      reportPost(db, { userId: authorId, postId, reason: "regret" }),
      "REPORT_OWN_POST",
    );
  });

  it("removes a post, closes its reports, and writes the trail", async () => {
    const { postId, threadId } = await threadWithReply();
    await reportPost(db, { userId: reporterId, postId, reason: "no" });

    await removePost(db, {
      moderatorId: modId,
      role: "MODERATOR",
      postId,
      reason: "against the rules",
    });

    const post = await db.forumPost.findUniqueOrThrow({ where: { id: postId } });
    expect(post.visibility).toBe("REMOVED");
    // The body survives removal — it is what the trail refers to.
    expect(post.body).toBe("the reply as posted");

    const report = await db.forumReport.findFirstOrThrow({ where: { postId } });
    expect(report.status).toBe("UPHELD");
    expect(report.resolvedById).toBe(modId);

    const trail = await getModerationTrail(db, { role: "MODERATOR" });
    const entry = trail.find((row) => row.postId === postId);
    expect(entry?.type).toBe("POST_REMOVED");
    expect(entry?.moderatorUsername).toContain(prefix);
    expect(entry?.reason).toBe("against the rules");

    // The reply stops counting toward the thread's reply total.
    const thread = await db.forumThread.findUniqueOrThrow({
      where: { id: threadId },
    });
    expect(thread.replyCount).toBe(0);
  });

  /**
   * Withdrawn and removed are different facts and stay different. A
   * moderator restoring an author's own withdrawal would be overruling a
   * person about their own words.
   */
  it("will not restore a post its author withdrew", async () => {
    const { postId } = await threadWithReply();
    await withdrawPost(db, { userId: authorId, postId });
    await expectForumError(
      restorePost(db, {
        moderatorId: modId,
        role: "MODERATOR",
        postId,
        reason: "looks fine to me",
      }),
      "NOT_REMOVED",
    );
    const post = await db.forumPost.findUniqueOrThrow({ where: { id: postId } });
    expect(post.visibility).toBe("WITHDRAWN");
  });

  it("restores what it removed, and says so in the trail", async () => {
    const { postId, threadId } = await threadWithReply();
    await removePost(db, {
      moderatorId: modId,
      role: "MODERATOR",
      postId,
      reason: "on reflection, no",
    });
    await restorePost(db, {
      moderatorId: modId,
      role: "MODERATOR",
      postId,
      reason: "misread it",
    });

    const post = await db.forumPost.findUniqueOrThrow({ where: { id: postId } });
    expect(post.visibility).toBe("VISIBLE");
    const thread = await db.forumThread.findUniqueOrThrow({
      where: { id: threadId },
    });
    expect(thread.replyCount).toBe(1);

    const trail = await getModerationTrail(db, { role: "MODERATOR" });
    const types = trail.filter((r) => r.postId === postId).map((r) => r.type);
    expect(types).toContain("POST_RESTORED");
    expect(types).toContain("POST_REMOVED");
  });

  it("removing the opening post takes the thread with it", async () => {
    const { threadId } = await threadWithReply();
    const opener = await db.forumPost.findFirstOrThrow({
      where: { threadId, ordinal: 1 },
    });
    await removePost(db, {
      moderatorId: modId,
      role: "MODERATOR",
      postId: opener.id,
      reason: "the whole thing",
    });
    const thread = await db.forumThread.findUniqueOrThrow({
      where: { id: threadId },
    });
    expect(thread.visibility).toBe("REMOVED");
    const trail = await getModerationTrail(db, { role: "MODERATOR" });
    expect(
      trail.some((r) => r.threadId === threadId && r.type === "THREAD_REMOVED"),
    ).toBe(true);
  });

  it("locks a thread without hiding a word of it", async () => {
    const { threadId } = await threadWithReply();
    await setThreadFlag(db, {
      moderatorId: modId,
      role: "MODERATOR",
      threadId,
      flag: "locked",
      value: true,
      reason: "gone round in circles",
    });
    const view = await getThreadPage(db, {
      threadId,
      userId: reporterId,
      role: "PLAYER",
      editWindowMinutes: EDIT_WINDOW_MINUTES,
    });
    expect(view?.locked).toBe(true);
    expect(view?.canReply).toBe(false);
    // Everything is still readable. Ending a conversation is not erasing it.
    expect(view?.posts.every((post) => post.body !== null)).toBe(true);
  });

  it("dismisses a report without touching the post", async () => {
    const { postId } = await threadWithReply();
    const { reportId } = await reportPost(db, {
      userId: reporterId,
      postId,
      reason: "I don't like it",
    });
    await dismissReport(db, {
      moderatorId: modId,
      role: "MODERATOR",
      reportId,
      note: "nothing wrong with it",
    });

    const report = await db.forumReport.findUniqueOrThrow({
      where: { id: reportId },
    });
    expect(report.status).toBe("DISMISSED");
    const post = await db.forumPost.findUniqueOrThrow({ where: { id: postId } });
    expect(post.visibility).toBe("VISIBLE");
    // And it leaves the queue.
    const queue = await getReportQueue(db, { role: "MODERATOR" });
    expect(queue.some((row) => row.reportId === reportId)).toBe(false);
  });

  it("refuses a closed report a second time", async () => {
    const { postId } = await threadWithReply();
    const { reportId } = await reportPost(db, {
      userId: reporterId,
      postId,
      reason: "…",
    });
    await dismissReport(db, {
      moderatorId: modId,
      role: "MODERATOR",
      reportId,
      note: "fine",
    });
    await expectForumError(
      dismissReport(db, {
        moderatorId: modId,
        role: "MODERATOR",
        reportId,
        note: "fine again",
      }),
      "REPORT_CLOSED",
    );
  });

  /**
   * Every moderator entry point checks the role itself. A player calling
   * one directly — which a server action makes possible for anyone who
   * knows the endpoint — is refused by the domain, not by the page.
   */
  it("refuses every moderator action to a player", async () => {
    const { postId, threadId } = await threadWithReply();
    const { reportId } = await reportPost(db, {
      userId: reporterId,
      postId,
      reason: "…",
    });
    const asPlayer = { moderatorId: authorId, role: "PLAYER" as const };

    await expectForumError(
      removePost(db, { ...asPlayer, postId, reason: "mine now" }),
      "NOT_A_MODERATOR",
    );
    await expectForumError(
      restorePost(db, { ...asPlayer, postId, reason: "…" }),
      "NOT_A_MODERATOR",
    );
    await expectForumError(
      setThreadFlag(db, {
        ...asPlayer,
        threadId,
        flag: "pinned",
        value: true,
        reason: "…",
      }),
      "NOT_A_MODERATOR",
    );
    await expectForumError(
      dismissReport(db, { ...asPlayer, reportId, note: "…" }),
      "NOT_A_MODERATOR",
    );
    await expectForumError(
      getReportQueue(db, { role: "PLAYER" }),
      "NOT_A_MODERATOR",
    );
    await expectForumError(
      getModerationTrail(db, { role: "PLAYER" }),
      "NOT_A_MODERATOR",
    );
  });

  /** An administrator is a moderator too — the ranking, exercised. */
  it("lets an administrator moderate", async () => {
    const admin = await createTestUser(db, {
      username: `${prefix}_ad_${randomUUID().slice(0, 8)}`,
      role: "ADMIN",
    });
    const { postId } = await threadWithReply();
    await removePost(db, {
      moderatorId: admin.id,
      role: "ADMIN",
      postId,
      reason: "administrator's call",
    });
    const post = await db.forumPost.findUniqueOrThrow({ where: { id: postId } });
    expect(post.visibility).toBe("REMOVED");
  });
});
