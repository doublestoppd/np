/**
 * The forum's load-bearing rules (ADR-56).
 *
 * Not a tour of the CRUD: these cover the four things that would actually
 * go wrong — two replies racing for one ordinal, a post edited or
 * withdrawn by someone it does not belong to, a removed post's body
 * reaching a reader who should not have it, and the opening post taking
 * its thread with it.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  createPost,
  createThread,
  editPost,
  withdrawPost,
} from "./commands";
import { getBoardPage, getThreadPage, listBoards } from "./queries";
import { EDIT_WINDOW_MINUTES } from "./config";
import { ForumError } from "./errors";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

describe.skipIf(!testDb)("the forums (integration)", () => {
  const db = testDb as PrismaClient;
  const prefix = fixturePrefix("forum");
  let authorId = "";
  let otherId = "";
  let modId = "";

  const EDIT_WINDOW = EDIT_WINDOW_MINUTES;

  async function expectForumError(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toBeInstanceOf(ForumError);
    await promise.catch((error: ForumError) => {
      expect(error.forumCode).toBe(code);
    });
  }

  async function startThread(userId = authorId, boardSlug = "general") {
    const { result } = await createThread(db, {
      userId,
      role: "PLAYER",
      boardSlug,
      title: `A thread ${randomUUID().slice(0, 8)}`,
      body: "The opening words.",
      idempotencyKey: randomUUID(),
    });
    return result.threadId;
  }

  beforeAll(async () => {
    // Boards are seeded content; the suite needs them present.
    const general = await db.forumBoard.findUnique({
      where: { slug: "general" },
    });
    expect(general, "seed the database before running this suite").not.toBeNull();
  });

  beforeEach(async () => {
    authorId = (
      await createTestUser(db, { username: `${prefix}_a_${randomUUID().slice(0, 8)}` })
    ).id;
    otherId = (
      await createTestUser(db, { username: `${prefix}_b_${randomUUID().slice(0, 8)}` })
    ).id;
    modId = (
      await createTestUser(db, {
        username: `${prefix}_m_${randomUUID().slice(0, 8)}`,
        role: "MODERATOR",
      })
    ).id;
  });

  afterAll(async () => {
    await db.forumPost.deleteMany({
      where: { author: { normalizedUsername: { startsWith: prefix } } },
    });
    await db.forumThread.deleteMany({
      where: { author: { normalizedUsername: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
    await db.$disconnect();
  });

  it("opens a thread whose first post is an ordinary post", async () => {
    const threadId = await startThread();
    const view = await getThreadPage(db, {
      threadId,
      userId: authorId,
      role: "PLAYER",
      editWindowMinutes: EDIT_WINDOW,
    });
    expect(view?.posts).toHaveLength(1);
    expect(view?.posts[0]?.ordinal).toBe(1);
    expect(view?.posts[0]?.body).toBe("The opening words.");
    // The opener is not counted as a reply.
    const thread = await db.forumThread.findUniqueOrThrow({
      where: { id: threadId },
    });
    expect(thread.replyCount).toBe(0);
  });

  /**
   * The one race in the module. Ordinals are read-then-written, so without
   * the thread's row lock two concurrent replies both compute the same
   * next number and one dies on the unique constraint.
   */
  it("gives concurrent replies distinct ordinals", async () => {
    const threadId = await startThread();
    const race = await runConcurrently([
      () =>
        createPost(db, {
          userId: authorId,
          threadId,
          body: "one",
          idempotencyKey: randomUUID(),
        }),
      () =>
        createPost(db, {
          userId: otherId,
          threadId,
          body: "two",
          idempotencyKey: randomUUID(),
        }),
      () =>
        createPost(db, {
          userId: otherId,
          threadId,
          body: "three",
          idempotencyKey: randomUUID(),
        }),
    ]);
    expect(race.rejected).toHaveLength(0);
    const ordinals = race.fulfilled.map((r) => r.result.ordinal).sort();
    expect(ordinals).toEqual([2, 3, 4]);

    const thread = await db.forumThread.findUniqueOrThrow({
      where: { id: threadId },
    });
    expect(thread.replyCount).toBe(3);
  });

  it("replays a reply rather than posting it twice", async () => {
    const threadId = await startThread();
    const key = randomUUID();
    const first = await createPost(db, {
      userId: authorId,
      threadId,
      body: "once",
      idempotencyKey: key,
    });
    const again = await createPost(db, {
      userId: authorId,
      threadId,
      body: "once",
      idempotencyKey: key,
    });
    expect(again.replayed).toBe(true);
    expect(again.result.postId).toBe(first.result.postId);
    expect(await db.forumPost.count({ where: { threadId } })).toBe(2);
  });

  it("refuses to edit or withdraw somebody else's post", async () => {
    const threadId = await startThread();
    const post = await db.forumPost.findFirstOrThrow({ where: { threadId } });
    await expectForumError(
      editPost(db, { userId: otherId, postId: post.id, body: "mine now" }),
      "NOT_YOURS",
    );
    await expectForumError(
      withdrawPost(db, { userId: otherId, postId: post.id }),
      "NOT_YOURS",
    );
    const unchanged = await db.forumPost.findUniqueOrThrow({
      where: { id: post.id },
    });
    expect(unchanged.body).toBe("The opening words.");
    expect(unchanged.visibility).toBe("VISIBLE");
  });

  /**
   * A moderator can remove a post. A moderator cannot rewrite it into
   * different words — that is not moderation, and the tools do not offer
   * it. This pins that the edit path checks ownership and nothing else.
   */
  it("does not let a moderator edit another person's words", async () => {
    const threadId = await startThread();
    const post = await db.forumPost.findFirstOrThrow({ where: { threadId } });
    await expectForumError(
      editPost(db, { userId: modId, postId: post.id, body: "rewritten" }),
      "NOT_YOURS",
    );
  });

  it("closes the edit window but never the withdraw one", async () => {
    const threadId = await startThread();
    const post = await db.forumPost.findFirstOrThrow({ where: { threadId } });
    const later = new Date(Date.now() + (EDIT_WINDOW + 1) * 60_000);

    await expectForumError(
      editPost(db, {
        userId: authorId,
        postId: post.id,
        body: "second thoughts",
        clock: { now: () => later },
      }),
      "EDIT_WINDOW_PASSED",
    );
    // Taking your words back is always allowed.
    const { withdrewThread } = await withdrawPost(db, {
      userId: authorId,
      postId: post.id,
      clock: { now: () => later },
    });
    expect(withdrewThread).toBe(true);
  });

  it("withdraws the thread when its opening post goes, and not otherwise", async () => {
    const threadId = await startThread();
    const { result: reply } = await createPost(db, {
      userId: otherId,
      threadId,
      body: "a reply",
      idempotencyKey: randomUUID(),
    });

    // A reply going does not take the thread with it.
    const replyResult = await withdrawPost(db, {
      userId: otherId,
      postId: reply.postId,
    });
    expect(replyResult.withdrewThread).toBe(false);
    let thread = await db.forumThread.findUniqueOrThrow({
      where: { id: threadId },
    });
    expect(thread.visibility).toBe("VISIBLE");
    // And it stops being counted.
    expect(thread.replyCount).toBe(0);

    const opener = await db.forumPost.findFirstOrThrow({
      where: { threadId, ordinal: 1 },
    });
    const openerResult = await withdrawPost(db, {
      userId: authorId,
      postId: opener.id,
    });
    expect(openerResult.withdrewThread).toBe(true);
    thread = await db.forumThread.findUniqueOrThrow({ where: { id: threadId } });
    expect(thread.visibility).toBe("WITHDRAWN");
  });

  /**
   * The visibility boundary. A withdrawn post keeps its place in the
   * thread so the conversation still reads, but its body reaches a
   * moderator and nobody else — including the person who wrote it.
   */
  it("withholds a withdrawn body from everyone but a moderator", async () => {
    const threadId = await startThread();
    const { result: reply } = await createPost(db, {
      userId: otherId,
      threadId,
      body: "something regretted",
      idempotencyKey: randomUUID(),
    });
    await withdrawPost(db, { userId: otherId, postId: reply.postId });

    const asPlayer = await getThreadPage(db, {
      threadId,
      userId: authorId,
      role: "PLAYER",
      editWindowMinutes: EDIT_WINDOW,
    });
    const gonePost = asPlayer?.posts.find((p) => p.id === reply.postId);
    expect(gonePost?.visibility).toBe("WITHDRAWN");
    expect(gonePost?.body).toBeNull();

    // Its author does not get it back either — withdrawn is withdrawn.
    const asAuthor = await getThreadPage(db, {
      threadId,
      userId: otherId,
      role: "PLAYER",
      editWindowMinutes: EDIT_WINDOW,
    });
    expect(asAuthor?.posts.find((p) => p.id === reply.postId)?.body).toBeNull();

    const asMod = await getThreadPage(db, {
      threadId,
      userId: modId,
      role: "MODERATOR",
      editWindowMinutes: EDIT_WINDOW,
    });
    expect(asMod?.posts.find((p) => p.id === reply.postId)?.body).toBe(
      "something regretted",
    );
  });

  it("hides a withdrawn thread from the board but not from a moderator", async () => {
    const threadId = await startThread();
    const opener = await db.forumPost.findFirstOrThrow({
      where: { threadId, ordinal: 1 },
    });
    await withdrawPost(db, { userId: authorId, postId: opener.id });

    const asPlayer = await getBoardPage(db, { slug: "general", role: "PLAYER" });
    expect(asPlayer?.threads.some((t) => t.id === threadId)).toBe(false);
    const asMod = await getBoardPage(db, {
      slug: "general",
      role: "MODERATOR",
    });
    expect(asMod?.threads.some((t) => t.id === threadId)).toBe(true);

    // And it is not readable by a player who has the link.
    expect(
      await getThreadPage(db, {
        threadId,
        userId: otherId,
        role: "PLAYER",
        editWindowMinutes: EDIT_WINDOW,
      }),
    ).toBeNull();
  });

  it("keeps a staff-only board open to replies but closed to new threads", async () => {
    await expectForumError(
      createThread(db, {
        userId: authorId,
        role: "PLAYER",
        boardSlug: "announcements",
        title: "Not for me to start",
        body: "…",
        idempotencyKey: randomUUID(),
      }),
      "BOARD_STAFF_ONLY",
    );
    // A moderator may, and then anyone may reply to it.
    const { result } = await createThread(db, {
      userId: modId,
      role: "MODERATOR",
      boardSlug: "announcements",
      title: `Notice ${randomUUID().slice(0, 8)}`,
      body: "Something is happening.",
      idempotencyKey: randomUUID(),
    });
    const reply = await createPost(db, {
      userId: authorId,
      threadId: result.threadId,
      body: "Good to know.",
      idempotencyKey: randomUUID(),
    });
    expect(reply.result.ordinal).toBe(2);
  });

  it("refuses replies to a locked thread and says so", async () => {
    const threadId = await startThread();
    await db.forumThread.update({
      where: { id: threadId },
      data: { locked: true },
    });
    await expectForumError(
      createPost(db, {
        userId: otherId,
        threadId,
        body: "one more thing",
        idempotencyKey: randomUUID(),
      }),
      "THREAD_LOCKED",
    );
  });

  it("lists the seeded boards in their authored order", async () => {
    const boards = await listBoards(db);
    expect(boards.length).toBeGreaterThanOrEqual(4);
    expect(boards.map((b) => b.slug)).toEqual([
      "announcements",
      "general",
      "help",
      "feedback",
    ]);
  });
});
