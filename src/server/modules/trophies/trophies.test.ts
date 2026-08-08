import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  getOwnTrophyCase,
  getPublicTrophyCase,
  syncTrophies,
} from "./trophies";
import { gatherTrophyFacts } from "./facts";
import { TROPHIES } from "./catalogue";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

/**
 * Awarding trophies against a real database (ADR-65).
 *
 * The catalogue's arithmetic is settled without one in catalogue.test.ts.
 * What needs a database is everything the predicates cannot see: that the
 * facts query actually counts the rows the game writes, that awarding is
 * idempotent, and — the one that matters most — that a public profile
 * never leaks what somebody has NOT done.
 */

const prefix = fixturePrefix("trophies");

describe.skipIf(!testDb)("trophies (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let username: string;

  beforeEach(async () => {
    username = `${prefix}_${randomUUID().slice(0, 8)}`;
    userId = (await createTestUser(db, { username })).id;
  });

  afterAll(async () => {
    await db.playerTrophy.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
  });

  it("gathers a zeroed snapshot for a brand new player", async () => {
    // Every count runs against a real schema here, so a field that names a
    // column or a relation wrongly fails loudly rather than silently
    // reading zero for ever.
    const facts = await gatherTrophyFacts(db, userId);
    for (const [name, value] of Object.entries(facts)) {
      expect(value, name).toBe(0);
    }
  });

  it("awards nothing to a player who has done nothing", async () => {
    expect(await syncTrophies(db, userId)).toEqual([]);
    const held = await db.playerTrophy.count({ where: { userId } });
    expect(held).toBe(0);
  });

  it("awards a trophy once, however many times it is synced", async () => {
    // The Long Flight wants a paper bird past forty walls, so one finished
    // run is enough to earn it — which makes it the cheapest trophy to set
    // up honestly, without writing a PlayerTrophy row by hand.
    await db.arcadeRun.create({
      data: {
        userId,
        game: "PAPER_BIRD",
        gameDate: "2032-08-02",
        seed: "a1b2c3d4",
        status: "FINISHED",
        score: 41,
        ticks: 5_000,
      },
    });

    const first = await syncTrophies(db, userId);
    expect(first).toContain("arcade-long-flight");

    // Syncing again must add nothing and must not move the earned date.
    const before = await db.playerTrophy.findFirstOrThrow({
      where: { userId, trophyKey: "arcade-long-flight" },
    });
    expect(await syncTrophies(db, userId)).toEqual([]);
    const after = await db.playerTrophy.findFirstOrThrow({
      where: { userId, trophyKey: "arcade-long-flight" },
    });
    expect(after.earnedAt).toEqual(before.earnedAt);
    expect(await db.playerTrophy.count({ where: { userId } })).toBe(1);
  });

  it("does not award one the player is a single point short of", async () => {
    await db.arcadeRun.create({
      data: {
        userId,
        game: "PAPER_BIRD",
        gameDate: "2032-08-02",
        seed: "a1b2c3d4",
        status: "FINISHED",
        score: 39,
        ticks: 5_000,
      },
    });
    expect(await syncTrophies(db, userId)).toEqual([]);
  });

  it("ignores a run the server never finished", async () => {
    // An abandoned or refused run is not a score. Reading it as one would
    // make the arcade trophies claimable by opening runs and walking away.
    await db.arcadeRun.create({
      data: {
        userId,
        game: "PAPER_BIRD",
        gameDate: "2032-08-02",
        seed: "a1b2c3d4",
        status: "VOID",
        score: 500,
        ticks: 5_000,
      },
    });
    const facts = await gatherTrophyFacts(db, userId);
    expect(facts.bestPaperBird).toBe(0);
    expect(await syncTrophies(db, userId)).toEqual([]);
  });

  it("gives the owner both what they have and what they have not", async () => {
    await db.arcadeRun.create({
      data: {
        userId,
        game: "SNAKE",
        gameDate: "2032-08-02",
        seed: "a1b2c3d4",
        status: "FINISHED",
        score: 44,
        ticks: 5_000,
      },
    });

    // Reading the case is what awards it — a player never has to go
    // anywhere else for their trophies to catch up.
    const own = await getOwnTrophyCase(db, userId);
    expect(own.earned.map((row) => row.key)).toEqual([
      "arcade-through-the-marram",
    ]);
    expect(own.earned[0]?.earnedAt).toBeInstanceOf(Date);
    expect(own.unearned.length).toBe(TROPHIES.length - 1);
    // Every one of them says what it takes, earned or not.
    for (const row of [...own.earned, ...own.unearned]) {
      expect(row.criteria.length, row.key).toBeGreaterThan(15);
    }
  });

  it("shows a visitor what was earned and never what was not", async () => {
    // The privacy rule, and the reason `unearned` is empty rather than
    // absent: a component that renders whatever it is handed cannot leak
    // a list that was never built.
    await db.arcadeRun.create({
      data: {
        userId,
        game: "TREE_CLIMB",
        gameDate: "2032-08-02",
        seed: "a1b2c3d4",
        status: "FINISHED",
        score: 40,
        ticks: 5_000,
      },
    });
    await syncTrophies(db, userId);

    const seen = await getPublicTrophyCase(db, { username });
    expect(seen.earned.map((row) => row.key)).toEqual([
      "arcade-top-of-the-beech",
    ]);
    expect(seen.unearned).toEqual([]);
  });

  it("matches a public profile case-insensitively, like every other lookup", async () => {
    await db.arcadeRun.create({
      data: {
        userId,
        game: "SNAKE",
        gameDate: "2032-08-02",
        seed: "a1b2c3d4",
        status: "FINISHED",
        score: 40,
        ticks: 5_000,
      },
    });
    await syncTrophies(db, userId);
    const shouted = await getPublicTrophyCase(db, {
      username: username.toUpperCase(),
    });
    expect(shouted.earned).toHaveLength(1);
  });

  it("reads a row whose trophy has been retired as simply absent", async () => {
    // Retiring a trophy is a catalogue edit, and the rows outlive it.
    await db.playerTrophy.create({
      data: { userId, trophyKey: "a-trophy-that-no-longer-exists" },
    });
    const own = await getOwnTrophyCase(db, userId);
    expect(own.earned).toEqual([]);
    const seen = await getPublicTrophyCase(db, { username });
    expect(seen.earned).toEqual([]);
  });
});
