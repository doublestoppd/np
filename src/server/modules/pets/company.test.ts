/**
 * Sitting with them, and what a companion turns up with (ADR-61).
 *
 * The two free features. What is worth pinning is not that they work but
 * that they cannot become the things they were built to avoid: sitting must
 * never cost anything or be gated behind ownership, and a keepsake must
 * never be worth farming, never stack up while you are away, and never
 * arrive twice from one draw.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { sitWithPet, SitError } from "./sit-with-pet";
import {
  chanceBp,
  ensureKeepsakeForToday,
  KeepsakeError,
  takeKeepsake,
  waitingKeepsake,
} from "./keepsakes";
import { describeSitting } from "./company";
import { BOND_BANDS, BOND_FOR } from "./bond";
import { SIT_COOLDOWN_MINUTES, SIT_HAPPINESS } from "./play-config";
import { NEED_DECAY_FLOOR } from "./pet-stats";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";
import { ensureTestSpecies } from "@test/factories/pets";

const prefix = fixturePrefix("company");
const clock = (at: Date) => ({ now: () => at });
const AT = new Date("2032-05-04T10:00:00Z");

/** A bond comfortably inside the top band, for the best odds available. */
const DEVOTED = (BOND_BANDS[BOND_BANDS.length - 1]?.minimum ?? 1_000) + 100;

describe("describeSitting", () => {
  const well = {
    hunger: 80,
    happiness: 80,
    energy: 80,
    health: 100,
    coat: 80,
    bond: 0,
    unwell: false,
  };

  it("says something about being unwell before anything else", () => {
    // A companion who is unwell and has a lovely coat is, to their person,
    // a companion who is unwell.
    const line = describeSitting({ ...well, coat: 100, unwell: true }, 0);
    expect(line).toMatch(/settle|doze|chin/i);
  });

  it("notices the empty stomach before the low spirits", () => {
    const line = describeSitting(
      { ...well, hunger: NEED_DECAY_FLOOR, happiness: NEED_DECAY_FLOOR },
      0,
    );
    expect(line).toMatch(/satchel|dinner|message/i);
  });

  it("changes with the bond when nothing is the matter", () => {
    const early = describeSitting({ ...well, bond: 0 }, 0);
    const late = describeSitting({ ...well, bond: DEVOTED }, 0);
    expect(early).not.toBe(late);
  });

  it("never thanks the player or asks for anything", () => {
    // A sentence like "your companion missed you!" is a bill wearing a
    // bow, and this feature's entire job is to not be that.
    for (const bond of [0, 60, 200, 500, 1_000]) {
      for (const roll of [0, 1, 2]) {
        for (const unwell of [true, false]) {
          const line = describeSitting({ ...well, bond, unwell }, roll);
          expect(line).not.toMatch(/thank|missed you|don't forget|remember to/i);
        }
      }
    }
  });

  it("is stable for the same roll and total for any roll", () => {
    expect(describeSitting(well, 7)).toBe(describeSitting(well, 7));
    for (let roll = 0; roll < 50; roll += 1) {
      expect(describeSitting(well, roll)).toBeTruthy();
    }
  });
});

describe("keepsake likelihood", () => {
  const kept = { happiness: 80, hunger: 80 };

  it("is nothing at all before the first bond band", () => {
    expect(chanceBp({ bond: 0, ...kept })).toBe(0);
  });

  it("rises with the bond and never reaches certainty", () => {
    const warming = chanceBp({ bond: 60, ...kept });
    const devoted = chanceBp({ bond: DEVOTED, ...kept });
    expect(warming).toBeGreaterThan(0);
    expect(devoted).toBeGreaterThan(warming);
    expect(devoted).toBeLessThan(10_000);
  });

  it("is nothing for a companion who is hungry or in poor spirits", () => {
    // Not a punishment: a companion who needs something is not out finding
    // you presents, and a gift on the day you forgot to feed them would
    // read as the game letting you off.
    expect(chanceBp({ bond: DEVOTED, happiness: 10, hunger: 80 })).toBe(0);
    expect(chanceBp({ bond: DEVOTED, happiness: 80, hunger: 5 })).toBe(0);
  });
});

describe.skipIf(!testDb)("company (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let petId: string;
  let keepsakeItemId: string;

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    userId = (await createTestUser(db, { username: `${prefix}_${suffix}` })).id;
    const species = await ensureTestSpecies(db, `${prefix}-species`);
    petId = (
      await db.pet.create({
        data: {
          name: "Fixture",
          ownerId: userId,
          speciesId: species.id,
          statsUpdatedAt: AT,
          bond: DEVOTED,
        },
      })
    ).id;
    keepsakeItemId = (
      await createTestItem(db, { slug: `${prefix}-pebble-${suffix}`, type: null })
    ).id;
    await db.keepsakeKind.create({
      data: {
        itemId: keepsakeItemId,
        weight: 100,
        line: "Brought in and put down with enormous ceremony.",
      },
    });
  });

  afterAll(async () => {
    await db.petKeepsake.deleteMany({
      where: { pet: { owner: { username: { startsWith: prefix } } } },
    });
    await db.keepsakeKind.deleteMany({
      where: { item: { slug: { startsWith: prefix } } },
    });
    await db.pet.deleteMany({
      where: { owner: { username: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
  });

  describe("sitting with them", () => {
    it("costs nothing, lifts the spirits a little, and warms the bond", async () => {
      const before = await db.pet.findUniqueOrThrow({ where: { id: petId } });
      const { result } = await sitWithPet(db, {
        userId,
        petId,
        idempotencyKey: randomUUID(),
        clock: clock(AT),
      });

      const after = await db.pet.findUniqueOrThrow({ where: { id: petId } });
      expect(after.happiness).toBe(before.happiness + SIT_HAPPINESS);
      expect(after.bond).toBe(before.bond + BOND_FOR.sit);
      expect(result.line).toBeTruthy();

      // The whole point: nothing left the satchel, because nothing had to
      // be in it.
      const held = await db.inventoryEntry.count({ where: { userId } });
      expect(held).toBe(0);
    });

    it("is available to a player who owns absolutely nothing", async () => {
      // The hole this feature exists to close. Every other care verb needs
      // something out of a satchel; a new account on a bad day has none.
      await db.user.update({ where: { id: userId }, data: { coins: 0n } });
      await expect(
        sitWithPet(db, {
          userId,
          petId,
          idempotencyKey: randomUUID(),
          clock: clock(AT),
        }),
      ).resolves.toBeTruthy();
    });

    it("refuses a second sitting inside the cooldown, gently and without cost", async () => {
      await sitWithPet(db, {
        userId,
        petId,
        idempotencyKey: randomUUID(),
        clock: clock(AT),
      });
      const soon = new Date(AT.getTime() + 60_000);
      await expect(
        sitWithPet(db, { userId, petId, idempotencyKey: randomUUID(), clock: clock(soon) }),
      ).rejects.toBeInstanceOf(SitError);

      const after = await db.pet.findUniqueOrThrow({ where: { id: petId } });
      // The refusal changed nothing at all — not even the bond.
      expect(after.bond).toBe(DEVOTED + BOND_FOR.sit);
    });

    it("comes round again after the cooldown", async () => {
      await sitWithPet(db, {
        userId,
        petId,
        idempotencyKey: randomUUID(),
        clock: clock(AT),
      });
      const later = new Date(AT.getTime() + (SIT_COOLDOWN_MINUTES + 1) * 60_000);
      await expect(
        sitWithPet(db, { userId, petId, idempotencyKey: randomUUID(), clock: clock(later) }),
      ).resolves.toBeTruthy();
    });

    it("replays a repeated submission instead of sitting twice", async () => {
      // The ordering trap ADR-59 records: a guard above the idempotency
      // wrapper would tell a double tap it was too soon.
      const key = randomUUID();
      const first = await sitWithPet(db, { userId, petId, idempotencyKey: key, clock: clock(AT) });
      const second = await sitWithPet(db, { userId, petId, idempotencyKey: key, clock: clock(AT) });
      expect(second.replayed).toBe(true);
      expect(second.result.line).toBe(first.result.line);

      const after = await db.pet.findUniqueOrThrow({ where: { id: petId } });
      expect(after.bond).toBe(DEVOTED + BOND_FOR.sit);
    });

    it("refuses somebody else's companion", async () => {
      const stranger = await createTestUser(db, {
        username: `${prefix}_x${randomUUID().slice(0, 6)}`,
      });
      await expect(
        sitWithPet(db, {
          userId: stranger.id,
          petId,
          idempotencyKey: randomUUID(),
          clock: clock(AT),
        }),
      ).rejects.toBeInstanceOf(SitError);
    });
  });

  describe("keepsakes", () => {
    /** Draws until this pet has one, walking the days forward. */
    async function drawUntilFound(): Promise<Date> {
      for (let day = 0; day < 60; day += 1) {
        const at = new Date(AT.getTime() + day * 86_400_000);
        const found = await ensureKeepsakeForToday(db, {
          petId,
          bond: DEVOTED,
          happiness: 80,
          hunger: 80,
          clock: clock(at),
        });
        if (found) return at;
      }
      throw new Error("no keepsake in sixty days — the draw is broken");
    }

    it("draws at most one a day, and the same answer on every refresh", async () => {
      const at = await drawUntilFound();
      const first = await waitingKeepsake(db, { petId });
      for (let i = 0; i < 5; i += 1) {
        await ensureKeepsakeForToday(db, {
          petId,
          bond: DEVOTED,
          happiness: 80,
          hunger: 80,
          clock: clock(at),
        });
      }
      const rows = await db.petKeepsake.count({ where: { petId } });
      expect(rows).toBe(1);
      expect((await waitingKeepsake(db, { petId }))?.id).toBe(first?.id);
    });

    it("cannot bank a fortnight of them while nobody visits", async () => {
      // The rule the doc comment claims and the schema does not give: a
      // companion with something already set out does not go and find
      // another. Coming back after two weeks finds ONE thing, never a
      // backlog to work through — which is the shape that turns a game
      // into a chore.
      for (let day = 0; day < 14; day += 1) {
        await ensureKeepsakeForToday(db, {
          petId,
          bond: DEVOTED,
          happiness: 80,
          hunger: 80,
          clock: clock(new Date(AT.getTime() + day * 86_400_000)),
        });
      }
      expect(
        await db.petKeepsake.count({ where: { petId, takenAt: null } }),
      ).toBe(1);
    });

    it("finds nothing at all for a companion who has just been met", async () => {
      const newPet = await db.pet.create({
        data: {
          name: "Stranger",
          ownerId: userId,
          speciesId: (await ensureTestSpecies(db, `${prefix}-species`)).id,
          bond: 0,
        },
      });
      for (let day = 0; day < 30; day += 1) {
        await ensureKeepsakeForToday(db, {
          petId: newPet.id,
          bond: 0,
          happiness: 80,
          hunger: 80,
          clock: clock(new Date(AT.getTime() + day * 86_400_000)),
        });
      }
      expect(await db.petKeepsake.count({ where: { petId: newPet.id } })).toBe(0);
    });

    it("hands it over once, and only on a deliberate tap", async () => {
      const at = await drawUntilFound();
      const waiting = await waitingKeepsake(db, { petId });
      expect(waiting).not.toBeNull();

      // Drawing it did not put anything in the satchel — rendering a page
      // must never grant an item.
      expect(await db.inventoryEntry.count({ where: { userId } })).toBe(0);

      const { result } = await takeKeepsake(db, {
        userId,
        petId,
        keepsakeId: waiting!.id,
        idempotencyKey: randomUUID(),
        clock: clock(at),
      });
      expect(result.itemName).toBeTruthy();

      const entry = await db.inventoryEntry.findFirstOrThrow({
        where: { userId, itemId: waiting!.itemId },
      });
      expect(entry.quantity).toBe(1);
      expect(await waitingKeepsake(db, { petId })).toBeNull();
    });

    it("refuses a second claim on the same keepsake", async () => {
      const at = await drawUntilFound();
      const waiting = await waitingKeepsake(db, { petId });
      await takeKeepsake(db, {
        userId,
        petId,
        keepsakeId: waiting!.id,
        idempotencyKey: randomUUID(),
        clock: clock(at),
      });
      // A different key, so this is a genuine second attempt rather than a
      // replay — the guarded update is what has to stop it.
      await expect(
        takeKeepsake(db, {
          userId,
          petId,
          keepsakeId: waiting!.id,
          idempotencyKey: randomUUID(),
          clock: clock(at),
        }),
      ).rejects.toBeInstanceOf(KeepsakeError);
      const entry = await db.inventoryEntry.findFirstOrThrow({
        where: { userId, itemId: waiting!.itemId },
      });
      expect(entry.quantity).toBe(1);
    });

    it("replays a repeated submission instead of granting twice", async () => {
      const at = await drawUntilFound();
      const waiting = await waitingKeepsake(db, { petId });
      const key = randomUUID();
      await takeKeepsake(db, {
        userId,
        petId,
        keepsakeId: waiting!.id,
        idempotencyKey: key,
        clock: clock(at),
      });
      const second = await takeKeepsake(db, {
        userId,
        petId,
        keepsakeId: waiting!.id,
        idempotencyKey: key,
        clock: clock(at),
      });
      expect(second.replayed).toBe(true);
      const entry = await db.inventoryEntry.findFirstOrThrow({
        where: { userId, itemId: waiting!.itemId },
      });
      expect(entry.quantity).toBe(1);
    });

    it("refuses a keepsake belonging to somebody else's companion", async () => {
      const at = await drawUntilFound();
      const waiting = await waitingKeepsake(db, { petId });
      const stranger = await createTestUser(db, {
        username: `${prefix}_y${randomUUID().slice(0, 6)}`,
      });
      await expect(
        takeKeepsake(db, {
          userId: stranger.id,
          petId,
          keepsakeId: waiting!.id,
          idempotencyKey: randomUUID(),
          clock: clock(at),
        }),
      ).rejects.toBeInstanceOf(KeepsakeError);
    });
  });
});
