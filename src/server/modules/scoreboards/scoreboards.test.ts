import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getDailyTop } from "./daily";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

/**
 * The daily scoreboards (ADR-67).
 *
 * A board is a small query with a lot of ways to be quietly wrong, and
 * every one of them is a way to publish something about a player that is
 * not true: somebody else's day, a refused run, or one keen player filling
 * all three places.
 */

const prefix = fixturePrefix("board");
const TODAY = "2032-08-02";
const clock = { now: () => new Date(`${TODAY}T11:00:00Z`) };

describe.skipIf(!testDb)("the daily scoreboards (integration)", () => {
  const db = testDb as PrismaClient;
  let viewerId: string;

  const player = async (name: string) =>
    (await createTestUser(db, { username: `${prefix}_${name}` })).id;

  const run = (
    userId: string,
    score: number,
    over: Record<string, unknown> = {},
  ) =>
    db.arcadeRun.create({
      data: {
        userId,
        game: "PAPER_BIRD",
        gameDate: TODAY,
        seed: "a1b2c3d4",
        status: "FINISHED",
        score,
        ticks: score * 100,
        ...over,
      },
    });

  beforeEach(async () => {
    await db.arcadeRun.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await db.sortingDailyBest.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
    viewerId = await player(`me${randomUUID().slice(0, 6)}`);
  });

  afterAll(async () => {
    await db.arcadeRun.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await db.sortingDailyBest.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
  });

  it("is empty before anybody has played", async () => {
    const board = await getDailyTop(db, {
      game: "PAPER_BIRD",
      viewerId,
      clock,
    });
    expect(board.rows).toEqual([]);
    // Still names what it would be counting, so the empty state can say so.
    expect(board.unit).toEqual(["wall", "walls"]);
  });

  it("takes the top three, in order, and stops", async () => {
    const others = await Promise.all(
      ["a", "b", "c", "d"].map((name) =>
        player(`${name}${randomUUID().slice(0, 4)}`),
      ),
    );
    await run(others[0] as string, 10);
    await run(others[1] as string, 30);
    await run(others[2] as string, 20);
    await run(others[3] as string, 5);

    const board = await getDailyTop(db, {
      game: "PAPER_BIRD",
      viewerId,
      clock,
    });
    expect(board.rows.map((row) => row.score)).toEqual([30, 20, 10]);
    expect(board.rows.map((row) => row.place)).toEqual([1, 2, 3]);
    // Fourth place is not a thing anybody is shown.
    expect(board.rows).toHaveLength(3);
  });

  it("gives each player one row, at their best", async () => {
    // Otherwise the keenest player takes all three places by playing more
    // than everybody else, which is a board about stamina.
    const keen = await player(`keen${randomUUID().slice(0, 4)}`);
    const other = await player(`other${randomUUID().slice(0, 4)}`);
    await run(keen, 40);
    await run(keen, 35);
    await run(keen, 30);
    await run(other, 12);

    const board = await getDailyTop(db, {
      game: "PAPER_BIRD",
      viewerId,
      clock,
    });
    expect(board.rows).toHaveLength(2);
    expect(board.rows[0]?.score).toBe(40);
  });

  it("ignores runs the server never finished", async () => {
    // A VOID run keeps whatever score it had when it was refused. On a
    // board that would be the one place cheating paid.
    const cheat = await player(`void${randomUUID().slice(0, 4)}`);
    await run(cheat, 9_999, { status: "VOID" });
    const honest = await player(`hon${randomUUID().slice(0, 4)}`);
    await run(honest, 7);

    const board = await getDailyTop(db, {
      game: "PAPER_BIRD",
      viewerId,
      clock,
    });
    expect(board.rows.map((row) => row.score)).toEqual([7]);
  });

  it("ignores a run that scored nothing", async () => {
    const nobody = await player(`zero${randomUUID().slice(0, 4)}`);
    await run(nobody, 0);
    const board = await getDailyTop(db, {
      game: "PAPER_BIRD",
      viewerId,
      clock,
    });
    expect(board.rows).toEqual([]);
  });

  it("is today's board and nobody else's day", async () => {
    // The whole point of a daily board: yesterday's hero is not still on
    // it, so nobody has a position to defend.
    const yesterday = await player(`yest${randomUUID().slice(0, 4)}`);
    await run(yesterday, 99, { gameDate: "2032-08-01" });
    const board = await getDailyTop(db, {
      game: "PAPER_BIRD",
      viewerId,
      clock,
    });
    expect(board.rows).toEqual([]);
  });

  it("keeps each game's board to itself", async () => {
    const climber = await player(`clm${randomUUID().slice(0, 4)}`);
    await run(climber, 50, { game: "TREE_CLIMB" });

    const bird = await getDailyTop(db, {
      game: "PAPER_BIRD",
      viewerId,
      clock,
    });
    expect(bird.rows).toEqual([]);
    const climb = await getDailyTop(db, {
      game: "TREE_CLIMB",
      viewerId,
      clock,
    });
    expect(climb.rows).toHaveLength(1);
    expect(climb.unit).toEqual(["branch", "branches"]);
  });

  it("marks the viewer's own row and nobody else's", async () => {
    const other = await player(`oth${randomUUID().slice(0, 4)}`);
    await run(other, 20);
    await run(viewerId, 10);

    const board = await getDailyTop(db, {
      game: "PAPER_BIRD",
      viewerId,
      clock,
    });
    expect(board.rows.map((row) => row.isViewer)).toEqual([false, true]);
  });

  it("reads the sorting bench's own daily bests", async () => {
    const one = await player(`s1${randomUUID().slice(0, 4)}`);
    const two = await player(`s2${randomUUID().slice(0, 4)}`);
    await db.sortingDailyBest.createMany({
      data: [
        { userId: one, gameDate: TODAY, bestScore: 2_100 },
        { userId: two, gameDate: TODAY, bestScore: 3_400 },
        // A player who has opened the bench but not scored is not on it.
        { userId: viewerId, gameDate: TODAY, bestScore: 0 },
      ],
    });

    const board = await getDailyTop(db, {
      game: "SORTING_BENCH",
      viewerId,
      clock,
    });
    expect(board.rows.map((row) => row.score)).toEqual([3_400, 2_100]);
    expect(board.unit).toEqual(["point", "points"]);
  });
});
