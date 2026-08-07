/**
 * Request board domain: assignment, atomic completion, sequencing and
 * wraparound, the UTC daily cap, idempotent retry, concurrency, and
 * rollback. Runs against a real database with the seeded content.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { completeCurrentRequest } from "./complete";
import { skipCurrentRequest } from "./skip";
import { getBoardView } from "./queries";
import { RequestError } from "./errors";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems, giveStack } from "@test/factories/items";

const prefix = fixturePrefix("req");
const BOARD_KEY = `${prefix}-board`;

async function expectRequestError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RequestError);
  expect((error as RequestError).requestCode).toBe(code);
}

describe.skipIf(!testDb)("request boards (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let boardId: string;
  let itemAId: string;
  let itemBId: string;
  /** Definition ids in authored sequence order. */
  let definitionIds: string[] = [];

  beforeAll(async () => {
    userId = (await createTestUser(db, { username: `${prefix}_player`, coins: 0n })).id;
    itemAId = (await createTestItem(db, { slug: `${prefix}-alpha` })).id;
    itemBId = (await createTestItem(db, { slug: `${prefix}-beta` })).id;

    const board = await db.requestBoard.create({
      data: {
        key: BOARD_KEY,
        name: "Test Requests",
        description: "Fixture board.",
        active: true,
        dailyCompletionLimit: 2,
      },
    });
    boardId = board.id;

    // Three requests: two single-item, one two-item.
    const specs = [
      { slug: "first", position: 0, reward: 40n, reqs: [[itemAId, 2] as const] },
      { slug: "second", position: 1, reward: 50n, reqs: [[itemBId, 1] as const] },
      {
        slug: "third",
        position: 2,
        reward: 70n,
        reqs: [[itemAId, 1] as const, [itemBId, 1] as const],
      },
    ];
    definitionIds = [];
    for (const spec of specs) {
      const definition = await db.requestDefinition.create({
        data: {
          boardId,
          slug: spec.slug,
          title: `Request ${spec.slug}`,
          flavorText: "",
          sequencePosition: spec.position,
          rewardCoins: spec.reward,
          active: true,
          requirements: {
            create: spec.reqs.map(([itemId, quantity]) => ({ itemId, quantity })),
          },
        },
      });
      definitionIds.push(definition.id);
    }
  });

  beforeEach(async () => {
    await db.requestCompletion.deleteMany({ where: { userId } });
    await db.playerRequestBoardProgress.deleteMany({ where: { userId } });
    await db.idempotencyKey.deleteMany({ where: { userId } });
    await db.transaction.deleteMany({ where: { userId } });
    await db.inventoryEntry.deleteMany({ where: { userId } });
    await db.rateLimitWindow.deleteMany({});
    await db.user.update({ where: { id: userId }, data: { coins: 0n } });
    // Every definition active again after tests that deactivate one.
    await db.requestDefinition.updateMany({
      where: { boardId },
      data: { active: true },
    });
  });

  afterAll(async () => {
    await db.requestCompletion.deleteMany({ where: { boardId } });
    await db.playerRequestBoardProgress.deleteMany({ where: { boardId } });
    await db.requestRequirement.deleteMany({
      where: { requestDefinition: { boardId } },
    });
    await db.requestDefinition.deleteMany({ where: { boardId } });
    await db.requestBoard.delete({ where: { id: boardId } });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
  });

  const complete = (expectedStateVersion: number, gameDate = "2026-03-01") =>
    completeCurrentRequest(db, {
      userId,
      boardKey: BOARD_KEY,
      expectedStateVersion,
      idempotencyKey: randomUUID(),
      gameDate,
    });

  it("assigns the first active request on first view, without mutating", async () => {
    const view = await getBoardView(db, { userId, boardKey: BOARD_KEY });
    expect(view?.current?.slug).toBe("first");
    expect(view?.stateVersion).toBe(0);
    expect(view?.totalCompleted).toBe(0);
    // A read never creates progress.
    expect(
      await db.playerRequestBoardProgress.count({ where: { userId, boardId } }),
    ).toBe(0);
  });

  it("reports owned quantities and deliverability", async () => {
    await giveStack(db, { userId, itemId: itemAId, quantity: 1 });
    let view = await getBoardView(db, { userId, boardKey: BOARD_KEY });
    expect(view?.current?.requirements[0]).toMatchObject({ required: 2, owned: 1 });
    expect(view?.current?.deliverable).toBe(false);

    await giveStack(db, { userId, itemId: itemAId, quantity: 2 });
    view = await getBoardView(db, { userId, boardKey: BOARD_KEY });
    expect(view?.current?.deliverable).toBe(true);
  });

  it("completes atomically: consumes items once, grants coins once, advances", async () => {
    await giveStack(db, { userId, itemId: itemAId, quantity: 5 });

    const { result } = await complete(0);

    expect(result.requestSlug).toBe("first");
    expect(result.rewardCoins).toBe("40");
    expect(result.newBalance).toBe("40");
    expect(result.nextRequestSlug).toBe("second");
    expect(result.completionOrdinal).toBe(1);

    const stack = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: itemAId } },
    });
    expect(stack.quantity).toBe(3);

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.coins).toBe(40n);

    // Ledger row matches the grant exactly.
    const ledger = await db.transaction.findMany({
      where: { userId, type: "REQUEST_REWARD" },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.coinsDelta).toBe(40n);

    // Immutable history with a requirements snapshot.
    const completion = await db.requestCompletion.findFirstOrThrow({
      where: { userId, boardId },
    });
    expect(completion.rewardCoins).toBe(40n);
    expect(completion.gameDate).toBe("2026-03-01");
    expect(completion.requirementsSnapshot).toEqual([
      { itemSlug: `${prefix}-alpha`, itemName: expect.any(String), quantity: 2 },
    ]);
  });

  it("insufficient items mutate nothing", async () => {
    await giveStack(db, { userId, itemId: itemAId, quantity: 1 });

    await expectRequestError(complete(0), "INSUFFICIENT_ITEMS");

    const stack = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: itemAId } },
    });
    expect(stack.quantity).toBe(1);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.coins).toBe(0n);
    expect(await db.requestCompletion.count({ where: { userId } })).toBe(0);
    expect(await db.transaction.count({ where: { userId } })).toBe(0);
  });

  it("a multi-item request consumes every requirement or none", async () => {
    // Enough for requests one and two, but only one beta for the third.
    await giveStack(db, { userId, itemId: itemAId, quantity: 3 });
    await giveStack(db, { userId, itemId: itemBId, quantity: 1 });
    await complete(0, "2026-03-01"); // first
    await complete(1, "2026-03-01"); // second — consumes the only beta

    // Third needs alpha + beta; beta is gone, so nothing may move. A later
    // game day, so the daily cap isn't what refuses it.
    const alphaBefore = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: itemAId } },
    });
    await expectRequestError(complete(2, "2026-03-02"), "INSUFFICIENT_ITEMS");
    const alphaAfter = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: itemAId } },
    });
    expect(alphaAfter.quantity).toBe(alphaBefore.quantity);
  });

  it("advances sequentially and wraps after the last active request", async () => {
    await giveStack(db, { userId, itemId: itemAId, quantity: 10 });
    await giveStack(db, { userId, itemId: itemBId, quantity: 10 });

    // Three completions across three game days (cap is 2/day).
    const first = await complete(0, "2026-03-01");
    expect(first.result.nextRequestSlug).toBe("second");
    const second = await complete(1, "2026-03-01");
    expect(second.result.nextRequestSlug).toBe("third");
    const third = await complete(2, "2026-03-02");
    // Wraps back to the first authored request.
    expect(third.result.nextRequestSlug).toBe("first");

    const view = await getBoardView(db, { userId, boardKey: BOARD_KEY });
    expect(view?.current?.slug).toBe("first");
    expect(view?.totalCompleted).toBe(3);
  });

  it("skips inactive requests when assigning the next one", async () => {
    await giveStack(db, { userId, itemId: itemAId, quantity: 10 });
    await giveStack(db, { userId, itemId: itemBId, quantity: 10 });
    // Retire the middle request.
    await db.requestDefinition.update({
      where: { id: definitionIds[1]! },
      data: { active: false },
    });

    const { result } = await complete(0);
    expect(result.nextRequestSlug).toBe("third");
  });

  it("freezes an assigned request when its definition is later deactivated", async () => {
    await giveStack(db, { userId, itemId: itemAId, quantity: 10 });
    await giveStack(db, { userId, itemId: itemBId, quantity: 10 });
    await complete(0); // now assigned "second"

    await db.requestDefinition.update({
      where: { id: definitionIds[1]! },
      data: { active: false },
    });

    // The assignment is untouched; completing it is refused explicitly
    // rather than silently swapped for another request.
    const progress = await db.playerRequestBoardProgress.findUniqueOrThrow({
      where: { userId_boardId: { userId, boardId } },
    });
    expect(progress.currentRequestDefinitionId).toBe(definitionIds[1]);
    await expectRequestError(complete(1), "REQUEST_INACTIVE");
  });

  it("enforces the daily cap on UTC game days", async () => {
    await giveStack(db, { userId, itemId: itemAId, quantity: 10 });
    await giveStack(db, { userId, itemId: itemBId, quantity: 10 });

    await complete(0, "2026-03-01");
    await complete(1, "2026-03-01");
    // Third attempt the same day hits the configured limit of 2.
    await expectRequestError(complete(2, "2026-03-01"), "DAILY_LIMIT_REACHED");

    // The assignment survives the cap — nothing is lost by waiting.
    const view = await getBoardView(db, {
      userId,
      boardKey: BOARD_KEY,
      gameDate: "2026-03-01",
    });
    expect(view?.current?.slug).toBe("third");
    expect(view?.remainingToday).toBe(0);

    // The next game day allows it again.
    const next = await complete(2, "2026-03-02");
    expect(next.result.requestSlug).toBe("third");
  });

  it("replays a repeated idempotency key without consuming twice", async () => {
    await giveStack(db, { userId, itemId: itemAId, quantity: 5 });
    const key = randomUUID();

    const first = await completeCurrentRequest(db, {
      userId,
      boardKey: BOARD_KEY,
      expectedStateVersion: 0,
      idempotencyKey: key,
      gameDate: "2026-03-01",
    });
    const second = await completeCurrentRequest(db, {
      userId,
      boardKey: BOARD_KEY,
      expectedStateVersion: 0,
      idempotencyKey: key,
      gameDate: "2026-03-01",
    });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual(first.result);

    const stack = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: itemAId } },
    });
    expect(stack.quantity).toBe(3);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.coins).toBe(40n);
    expect(await db.requestCompletion.count({ where: { userId } })).toBe(1);
  });

  it("two concurrent submissions produce exactly one completion", async () => {
    await giveStack(db, { userId, itemId: itemAId, quantity: 5 });

    const { fulfilled } = await runConcurrently([
      () => complete(0),
      () => complete(0),
    ]);

    expect(fulfilled).toHaveLength(1);
    const stack = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: itemAId } },
    });
    expect(stack.quantity).toBe(3);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.coins).toBe(40n);
    expect(await db.requestCompletion.count({ where: { userId } })).toBe(1);
    expect(
      await db.transaction.count({ where: { userId, type: "REQUEST_REWARD" } }),
    ).toBe(1);
  });

  it("a stale state version is refused with nothing consumed", async () => {
    await giveStack(db, { userId, itemId: itemAId, quantity: 5 });
    await giveStack(db, { userId, itemId: itemBId, quantity: 5 });
    await complete(0); // version is now 1

    await expectRequestError(complete(0), "STALE_STATE");

    // The completed first request stands; the second was not consumed.
    expect(await db.requestCompletion.count({ where: { userId } })).toBe(1);
    const stackB = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: itemBId } },
    });
    expect(stackB.quantity).toBe(5);

    // And the view hands back the authoritative version to retry with.
    const view = await getBoardView(db, { userId, boardKey: BOARD_KEY });
    expect(view?.stateVersion).toBe(1);
  });

  it("refuses when the board is inactive", async () => {
    await giveStack(db, { userId, itemId: itemAId, quantity: 5 });
    await db.requestBoard.update({
      where: { id: boardId },
      data: { active: false },
    });
    await expectRequestError(complete(0), "BOARD_INACTIVE");
    await db.requestBoard.update({
      where: { id: boardId },
      data: { active: true },
    });
  });

  const skip = (expectedStateVersion: number) =>
    skipCurrentRequest(db, {
      userId,
      boardKey: BOARD_KEY,
      expectedStateVersion,
      idempotencyKey: randomUUID(),
    });

  describe("setting a request aside", () => {
    it("posts the next request without consuming, granting, or recording", async () => {
      await giveStack(db, { userId, itemId: itemAId, quantity: 5 });

      const { result } = await skip(0);
      expect(result.skippedSlug).toBe("first");
      expect(result.nextRequestSlug).toBe("second");
      expect(result.stateVersion).toBe(1);

      const view = await getBoardView(db, { userId, boardKey: BOARD_KEY });
      expect(view?.current?.slug).toBe("second");
      // Nothing moved: this is the whole point of a free skip.
      expect(
        (
          await db.inventoryEntry.findUniqueOrThrow({
            where: { userId_itemId: { userId, itemId: itemAId } },
          })
        ).quantity,
      ).toBe(5);
      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.coins).toBe(0n);
      expect(await db.transaction.count({ where: { userId } })).toBe(0);
      expect(await db.requestCompletion.count({ where: { userId } })).toBe(0);
      expect(view?.totalCompleted).toBe(0);
    });

    it("does not spend the daily allowance, even once the cap is reached", async () => {
      // dailyCompletionLimit is 2 on this fixture board.
      await giveStack(db, { userId, itemId: itemAId, quantity: 5 });
      await giveStack(db, { userId, itemId: itemBId, quantity: 5 });
      await complete(0);
      await complete(1);

      const onDay = { userId, boardKey: BOARD_KEY, gameDate: "2026-03-01" };
      const capped = await getBoardView(db, onDay);
      expect(capped?.remainingToday).toBe(0);
      expect(capped?.current?.slug).toBe("third");

      // Looking ahead is still allowed when the day's work is done.
      const { result } = await skip(2);
      expect(result.nextRequestSlug).toBe("first");
      const after = await getBoardView(db, onDay);
      expect(after?.remainingToday).toBe(0);
      expect(after?.completedToday).toBe(2);
    });

    it("wraps past the last request back to the first", async () => {
      await skip(0);
      await skip(1);
      const { result } = await skip(2);
      expect(result.skippedSlug).toBe("third");
      expect(result.nextRequestSlug).toBe("first");
    });

    it("skips over a deactivated request", async () => {
      await db.requestDefinition.update({
        where: { id: definitionIds[1]! },
        data: { active: false },
      });
      const { result } = await skip(0);
      expect(result.nextRequestSlug).toBe("third");
    });

    it("refuses a stale state token and changes nothing", async () => {
      await skip(0);
      await expectRequestError(skip(0), "STALE_STATE");
      const view = await getBoardView(db, { userId, boardKey: BOARD_KEY });
      expect(view?.current?.slug).toBe("second");
      expect(view?.stateVersion).toBe(1);
    });

    it("refuses when the board has only one posting", async () => {
      await db.requestDefinition.updateMany({
        where: { id: { in: [definitionIds[1]!, definitionIds[2]!] } },
        data: { active: false },
      });
      await expectRequestError(skip(0), "NO_OTHER_REQUEST");
      const view = await getBoardView(db, { userId, boardKey: BOARD_KEY });
      expect(view?.hasOtherRequests).toBe(false);
      expect(view?.stateVersion).toBe(0);
    });

    it("replays a duplicate submission instead of advancing twice", async () => {
      const key = randomUUID();
      const params = {
        userId,
        boardKey: BOARD_KEY,
        expectedStateVersion: 0,
        idempotencyKey: key,
      };
      const first = await skipCurrentRequest(db, params);
      const retry = await skipCurrentRequest(db, params);
      expect(retry.replayed).toBe(true);
      expect(retry.result).toEqual(first.result);

      const view = await getBoardView(db, { userId, boardKey: BOARD_KEY });
      expect(view?.current?.slug).toBe("second");
      expect(view?.stateVersion).toBe(1);
    });

    it("concurrent skips advance exactly one position", async () => {
      const { fulfilled } = await runConcurrently(
        Array.from({ length: 4 }, () => () => skip(0)),
      );
      expect(fulfilled).toHaveLength(1);
      const view = await getBoardView(db, { userId, boardKey: BOARD_KEY });
      expect(view?.current?.slug).toBe("second");
      expect(view?.stateVersion).toBe(1);
    });

    it("a skip invalidates an in-flight completion rather than losing items", async () => {
      await giveStack(db, { userId, itemId: itemAId, quantity: 5 });
      await skip(0);
      // The player's open tab still believes it is holding version 0.
      await expectRequestError(complete(0), "STALE_STATE");
      expect(
        (
          await db.inventoryEntry.findUniqueOrThrow({
            where: { userId_itemId: { userId, itemId: itemAId } },
          })
        ).quantity,
      ).toBe(5);
      expect(await db.requestCompletion.count({ where: { userId } })).toBe(0);
    });
  });

  it("refuses a commerce-disabled account", async () => {
    await giveStack(db, { userId, itemId: itemAId, quantity: 5 });
    await db.user.update({
      where: { id: userId },
      data: { commerceDisabledAt: new Date() },
    });
    await expectRequestError(complete(0), "COMMERCE_DISABLED");
    await db.user.update({
      where: { id: userId },
      data: { commerceDisabledAt: null },
    });
    expect(await db.requestCompletion.count({ where: { userId } })).toBe(0);
  });
});
