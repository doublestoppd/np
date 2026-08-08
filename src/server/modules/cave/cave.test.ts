/**
 * The Sunken Stair (ADR-59).
 *
 * The properties worth pinning down are all about what the client is NOT
 * told and what a second attempt cannot do. A test that only walked a
 * happy path would pass while the response quietly carried the answer to
 * the next room.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { beginDelve, chooseDoor, getDelveView } from "./delve";
import { correctDoor, replayChoices } from "./layout";
import { CAVE_DEPTH, cacheAt, totalOnOffer } from "./config";
import { CaveError } from "./errors";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

const prefix = fixturePrefix("cave");

/** A fixed clock, so "today" cannot roll over mid-test. */
function clock(at = new Date("2031-03-09T09:00:00Z")) {
  return { now: () => at };
}

describe.skipIf(!testDb)("the sunken stair (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;

  beforeEach(async () => {
    userId = (
      await createTestUser(db, { username: `${prefix}_${randomUUID().slice(0, 8)}` })
    ).id;
  });

  afterAll(async () => {
    await db.caveDelve.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
    await db.$disconnect();
  });

  /** The seed of the delve in progress — test-only, never a response. */
  async function seedOf(): Promise<string> {
    const delve = await db.caveDelve.findFirstOrThrow({ where: { userId } });
    return delve.seed;
  }

  /** Walks the descent correctly to `depth`, returning the last result. */
  async function descend(depth: number) {
    const seed = await seedOf();
    let last;
    for (let at = 1; at <= depth; at += 1) {
      last = await chooseDoor(db, {
        userId,
        depth: at,
        door: correctDoor(seed, at),
        idempotencyKey: randomUUID(),
        clock: clock(),
      });
    }
    return last!;
  }

  it("opens closed, and going in is a deliberate act", async () => {
    const before = await getDelveView(db, { userId, clock: clock() });
    expect(before.status).toBe("NOT_STARTED");
    expect(before.current).toBeNull();
    // Reading the view must not have opened anything.
    expect(await db.caveDelve.count({ where: { userId } })).toBe(0);

    const view = await beginDelve(db, { userId, clock: clock() });
    expect(view.status).toBe("IN_PROGRESS");
    expect(view.current?.depth).toBe(1);
    expect(view.current?.doors).toHaveLength(2);
    expect(view.totalDepth).toBe(CAVE_DEPTH);
  });

  /**
   * The whole security model in one assertion. The seed decides every
   * door, so if it reaches the client the descent is solved.
   */
  it("never puts the seed, or any unopened answer, in the view", async () => {
    await beginDelve(db, { userId, clock: clock() });
    const seed = await seedOf();
    const view = await getDelveView(db, { userId, clock: clock() });
    const serialized = JSON.stringify(view);

    expect(serialized).not.toContain(seed);
    expect(serialized).not.toMatch(/seed/i);
    expect(serialized).not.toMatch(/correct.?door/i);
    // Only the room they are standing in is described. Nine unopened
    // rooms in the payload would be nine rooms of foreknowledge.
    expect(view.current?.depth).toBe(1);
    expect(view.steps).toEqual([]);
  });

  it("pays the cache at every second room, and nothing in between", async () => {
    await beginDelve(db, { userId, clock: clock() });
    const before = (await db.user.findUniqueOrThrow({ where: { id: userId } })).coins;

    for (let depth = 1; depth <= 4; depth += 1) {
      const seed = await seedOf();
      const { result } = await chooseDoor(db, {
        userId,
        depth,
        door: correctDoor(seed, depth),
        idempotencyKey: randomUUID(),
        clock: clock(),
      });
      expect(result.coinsAwarded).toBe((cacheAt(depth) ?? 0n).toString());
    }

    const after = (await db.user.findUniqueOrThrow({ where: { id: userId } })).coins;
    expect(after - before).toBe((cacheAt(2) ?? 0n) + (cacheAt(4) ?? 0n));
    // Wallet and ledger move together, or reconciliation lights up.
    const ledgered = (
      await db.transaction.findMany({ where: { userId, type: "CAVE_FIND" } })
    ).reduce((total, row) => total + row.coinsDelta, 0n);
    expect(ledgered).toBe(after - before);
  });

  it("keeps everything found when a wrong door ends it", async () => {
    await beginDelve(db, { userId, clock: clock() });
    await descend(2);
    const banked = (await db.user.findUniqueOrThrow({ where: { id: userId } })).coins;
    expect(banked).toBeGreaterThan(0n);

    const seed = await seedOf();
    const wrong = (correctDoor(seed, 3) === 0 ? 1 : 0) as 0 | 1;
    const { result } = await chooseDoor(db, {
      userId,
      depth: 3,
      door: wrong,
      idempotencyKey: randomUUID(),
      clock: clock(),
    });

    expect(result.view.status).toBe("TURNED_BACK");
    expect(result.step.correct).toBe(false);
    expect(result.step.flavor.length).toBeGreaterThan(0);
    // Nothing taken back. This is the product rule, not a nicety.
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } })).coins,
    ).toBe(banked);
  });

  it("is one descent a day, however hard you push at it", async () => {
    await beginDelve(db, { userId, clock: clock() });
    const seed = await seedOf();
    await chooseDoor(db, {
      userId,
      depth: 1,
      door: (correctDoor(seed, 1) === 0 ? 1 : 0) as 0 | 1,
      idempotencyKey: randomUUID(),
      clock: clock(),
    });

    await expect(
      beginDelve(db, { userId, clock: clock() }),
    ).rejects.toBeInstanceOf(CaveError);
    await expect(
      chooseDoor(db, {
        userId,
        depth: 1,
        door: 0,
        idempotencyKey: randomUUID(),
        clock: clock(),
      }),
    ).rejects.toBeInstanceOf(CaveError);
    expect(await db.caveDelve.count({ where: { userId } })).toBe(1);
  });

  it("refuses a choice aimed at a room the player is not in", async () => {
    await beginDelve(db, { userId, clock: clock() });
    // A stale second tab still thinks it is at the entrance; a script
    // trying to skip aims deeper. Both name the wrong room.
    for (const depth of [2, 5, CAVE_DEPTH]) {
      await expect(
        chooseDoor(db, {
          userId,
          depth,
          door: 0,
          idempotencyKey: randomUUID(),
          clock: clock(),
        }),
      ).rejects.toBeInstanceOf(CaveError);
    }
    const delve = await db.caveDelve.findFirstOrThrow({ where: { userId } });
    expect(delve.choices).toBe("");
  });

  it("replays a repeated submission instead of taking two steps", async () => {
    await beginDelve(db, { userId, clock: clock() });
    const seed = await seedOf();
    const key = randomUUID();
    const args = {
      userId,
      depth: 1,
      door: correctDoor(seed, 1),
      idempotencyKey: key,
      clock: clock(),
    };
    const first = await chooseDoor(db, args);
    const second = await chooseDoor(db, args);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    const delve = await db.caveDelve.findFirstOrThrow({ where: { userId } });
    expect(delve.choices).toHaveLength(1);
  });

  it("pays the hoard once, at the bottom, and only there", async () => {
    await beginDelve(db, { userId, clock: clock() });
    const before = (await db.user.findUniqueOrThrow({ where: { id: userId } })).coins;
    const last = await descend(CAVE_DEPTH);

    expect(last.result.view.status).toBe("CLEARED");
    expect(last.result.view.depth).toBe(CAVE_DEPTH);
    expect(last.result.prizeName).not.toBeNull();
    expect(last.result.view.prize).not.toBeNull();

    const after = (await db.user.findUniqueOrThrow({ where: { id: userId } })).coins;
    expect(after - before).toBe(totalOnOffer());

    // The prize is really in the satchel, with a ledger row behind it.
    const delve = await db.caveDelve.findFirstOrThrow({ where: { userId } });
    const held = await db.inventoryEntry.findUniqueOrThrow({
      where: {
        userId_itemId: { userId, itemId: delve.prizeItemId as string },
      },
    });
    expect(held.quantity).toBe(1);
    expect(
      await db.transaction.count({
        where: { userId, type: "CAVE_FIND", itemId: delve.prizeItemId },
      }),
    ).toBe(1);
  });

  it("gives two players different caves on the same day", async () => {
    /**
     * The reason this activity needs no rotation bands (ADR-44). The word
     * puzzle and the lantern have one answer a day that any player can
     * post; here there is nothing to post, because the doors are drawn per
     * descent. Two players comparing notes learn nothing.
     */
    const others = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const other = await createTestUser(db, {
          username: `${prefix}_${randomUUID().slice(0, 8)}`,
        });
        await beginDelve(db, { userId: other.id, clock: clock() });
        const delve = await db.caveDelve.findFirstOrThrow({
          where: { userId: other.id },
        });
        return Array.from({ length: CAVE_DEPTH }, (_, i) =>
          correctDoor(delve.seed, i + 1),
        ).join("");
      }),
    );
    // Eight independent 10-bit routes colliding entirely would be a
    // 1-in-2^10 coincidence per pair; identical seeds would be certain.
    expect(new Set(others).size).toBeGreaterThan(1);
  });
});

describe("replayChoices", () => {
  const seed = "0123456789abcdef0123456789abcdef";
  const right = (depth: number) => String(correctDoor(seed, depth));

  it("counts a clean run to its full depth", () => {
    const choices = Array.from({ length: 10 }, (_, i) => right(i + 1)).join("");
    expect(replayChoices(seed, choices)).toEqual({
      depth: 10,
      turnedBack: false,
      turnedBackAt: null,
    });
  });

  it("stops at the first wrong door and reports where", () => {
    const wrong = correctDoor(seed, 3) === 0 ? "1" : "0";
    const choices = `${right(1)}${right(2)}${wrong}`;
    expect(replayChoices(seed, choices)).toEqual({
      depth: 2,
      turnedBack: true,
      turnedBackAt: 3,
    });
  });

  it("is stable for a seed, so a descent cannot change under its player", () => {
    const first = Array.from({ length: 10 }, (_, i) => correctDoor(seed, i + 1));
    const again = Array.from({ length: 10 }, (_, i) => correctDoor(seed, i + 1));
    expect(again).toEqual(first);
  });

  it("does not answer every room the same way", () => {
    // A derivation that returned a constant would make the cave a single
    // coin toss repeated, and every test above would still pass.
    const doors = Array.from({ length: 64 }, (_, i) => correctDoor(seed, i + 1));
    expect(new Set(doors).size).toBe(2);
  });
});
