/**
 * Ailments, remedies, grooming and the bond (ADR-60).
 *
 * The tests that matter here are the ones that pin the PRODUCT RULES, not
 * the happy paths. A companion must never be made permanently worse, an
 * absence must never stack up damage, a bond must never fall, and a
 * refused remedy must never be swallowed. Each of those is a way this
 * feature could quietly become the punitive mechanic CLAUDE.md rules out
 * while every ordinary test still passed.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  AilmentError,
  applyAilment,
  chanceBp,
  currentAilment,
  ensureAilmentForToday,
} from "./ailments";
import { treatPet } from "./treat-pet";
import { groomPet, GroomError } from "./groom-pet";
import { BOND_BANDS, BOND_FOR, bondBand, bondBandProgress } from "./bond";
import { applyStatDecay, NEED_DECAY_FLOOR, STAT_MAX } from "./pet-stats";
import { GROOM_COOLDOWN_MINUTES } from "./play-config";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems, giveStack } from "@test/factories/items";
import { ensureTestSpecies } from "@test/factories/pets";

const prefix = fixturePrefix("care");
const clock = (at: Date) => ({ now: () => at });
const AT = new Date("2032-02-11T09:00:00Z");

describe.skipIf(!testDb)("pet care (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let petId: string;
  let kindId: string;
  let kindKey: string;
  let specificRemedyId: string;
  let otherRemedyId: string;
  let tonicId: string;
  let brushId: string;
  let combId: string;

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    userId = (await createTestUser(db, { username: `${prefix}_${suffix}` })).id;
    const species = await ensureTestSpecies(db, `${prefix}-species`);
    petId = (
      await db.pet.create({
        data: { name: "Fixture", ownerId: userId, speciesId: species.id },
      })
    ).id;

    // Two ailment kinds, so "wrong remedy" is a real case rather than a
    // theoretical one.
    kindKey = `${prefix}-cough-${suffix}`;
    const kind = await db.ailmentKind.create({
      data: {
        key: kindKey,
        name: "Fixture Cough",
        symptom: "Coughs.",
        comfort: "Nothing is wrong.",
        restHours: 24,
        happinessDrag: 2,
        healthCap: 70,
      },
    });
    kindId = kind.id;
    const otherKind = await db.ailmentKind.create({
      data: {
        key: `${prefix}-itch-${suffix}`,
        name: "Fixture Itch",
        symptom: "Itches.",
        comfort: "Nothing is wrong.",
        restHours: 24,
      },
    });

    specificRemedyId = (
      await createTestItem(db, { slug: `${prefix}-syrup-${suffix}`, type: "REMEDY" })
    ).id;
    otherRemedyId = (
      await createTestItem(db, { slug: `${prefix}-salve-${suffix}`, type: "REMEDY" })
    ).id;
    tonicId = (
      await createTestItem(db, { slug: `${prefix}-tonic-${suffix}`, type: "REMEDY" })
    ).id;
    await db.remedy.createMany({
      data: [
        { itemId: specificRemedyId, kindId, comfort: 6 },
        { itemId: otherRemedyId, kindId: otherKind.id, comfort: 6 },
        { itemId: tonicId, kindId: null, comfort: 10 },
      ],
    });

    brushId = (
      await createTestItem(db, {
        slug: `${prefix}-brush-${suffix}`,
        type: "GROOMING_TOOL",
        coatCare: 20,
      })
    ).id;
    combId = (
      await createTestItem(db, {
        slug: `${prefix}-comb-${suffix}`,
        type: "GROOMING_TOOL",
        coatCare: 25,
      })
    ).id;
    for (const itemId of [specificRemedyId, otherRemedyId, tonicId, brushId, combId]) {
      await giveStack(db, { userId, itemId, quantity: 2 });
    }
  });

  afterAll(async () => {
    await db.petAilment.deleteMany({
      where: { pet: { owner: { username: { startsWith: prefix } } } },
    });
    await db.petGroomUse.deleteMany({
      where: { pet: { owner: { username: { startsWith: prefix } } } },
    });
    await db.pet.deleteMany({
      where: { owner: { username: { startsWith: prefix } } },
    });
    await db.remedy.deleteMany({
      where: { item: { slug: { startsWith: prefix } } },
    });
    await db.ailmentKind.deleteMany({ where: { key: { startsWith: prefix } } });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  /** Puts a bout on the companion without waiting for a lucky roll. */
  async function makeIll(startedAt = AT, hours = 24) {
    return db.petAilment.create({
      data: {
        petId,
        kindId,
        gameDate: startedAt.toISOString().slice(0, 10),
        startedAt,
        restsAt: new Date(startedAt.getTime() + hours * 3_600_000),
      },
    });
  }

  // ---- Onset ---------------------------------------------------------

  it("asks the same question all day — refreshing cannot reroll it", async () => {
    const first = await ensureAilmentForToday(db, {
      petId,
      coat: 80,
      bond: 0,
      clock: clock(AT),
    });
    for (let i = 0; i < 12; i += 1) {
      const again = await ensureAilmentForToday(db, {
        petId,
        coat: 80,
        bond: 0,
        // Later in the same game day.
        clock: clock(new Date(AT.getTime() + i * 600_000)),
      });
      expect(again?.key ?? null).toBe(first?.key ?? null);
    }
    // At most one row exists for the day, whatever the answer was.
    expect(await db.petAilment.count({ where: { petId } })).toBeLessThanOrEqual(1);
  });

  /**
   * The test above asserts the answer is STABLE, which a function that
   * always says "no" would also satisfy. This one asserts the feature
   * exists at all: across enough companions, some of them catch something.
   */
  it("actually gives some companions something, some days", async () => {
    const species = await ensureTestSpecies(db, `${prefix}-species`);
    const pets = await Promise.all(
      Array.from({ length: 40 }, async (_, i) =>
        db.pet.create({
          data: { name: `Roll${i}`, ownerId: userId, speciesId: species.id },
        }),
      ),
    );
    let ill = 0;
    for (const pet of pets) {
      const got = await ensureAilmentForToday(db, {
        petId: pet.id,
        // The worst care, so the chance is at its ceiling of 15%.
        coat: 0,
        bond: 0,
        clock: clock(AT),
      });
      if (got) ill += 1;
    }
    // At 15% over 40 draws, seeing none would be a 1-in-700 fluke — and
    // the draw is deterministic, so this is stable rather than lucky.
    expect(ill).toBeGreaterThan(0);
    // And it is an ailment, not a catastrophe: nowhere near everybody.
    expect(ill).toBeLessThan(pets.length / 2);
  });

  it("never starts a second bout on the same day", async () => {
    await makeIll();
    await ensureAilmentForToday(db, {
      petId,
      coat: 15,
      bond: 0,
      clock: clock(new Date(AT.getTime() + 3_600_000)),
    });
    expect(await db.petAilment.count({ where: { petId } })).toBe(1);
  });

  it("stops being current once it has run its course, with nothing to sweep up", async () => {
    await makeIll(AT, 24);
    expect(
      await currentAilment(db, { petId, clock: clock(new Date(AT.getTime() + 3_600_000)) }),
    ).not.toBeNull();
    // A week later — the shape of a player who was away.
    expect(
      await currentAilment(db, {
        petId,
        clock: clock(new Date(AT.getTime() + 7 * 86_400_000)),
      }),
    ).toBeNull();
  });

  it("is always possible and never likely, whatever the care", async () => {
    const worst = chanceBp({ coat: 0, bond: 0 });
    const best = chanceBp({ coat: 100, bond: 10_000 });
    expect(best).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(1_500);
    // Care helps, and only helps.
    expect(best).toBeLessThan(worst);
  });

  // ---- Effects -------------------------------------------------------

  it("caps health rather than draining it, and never breaks the floors", async () => {
    const base = { hunger: 50, happiness: 50, energy: 50, health: 100, coat: 50 };
    const ailment = {
      key: "x",
      name: "X",
      symptom: "",
      comfort: "",
      startedAt: AT,
      restsAt: new Date(AT.getTime() + 86_400_000),
      healthCap: 70,
      happinessDrag: 2,
    };
    const after = applyAilment(base, ailment, {
      from: AT,
      now: new Date(AT.getTime() + 10 * 3_600_000),
    });
    expect(after.health).toBe(70);
    // Health is never pushed BELOW the cap by the ailment.
    const alreadyLow = applyAilment(
      { ...base, health: 40 },
      ailment,
      { from: AT, now: new Date(AT.getTime() + 3_600_000) },
    );
    expect(alreadyLow.health).toBe(40);
  });

  it("cannot push happiness below the floor ordinary neglect already reaches", async () => {
    const ailment = {
      key: "x",
      name: "X",
      symptom: "",
      comfort: "",
      startedAt: AT,
      restsAt: new Date(AT.getTime() + 86_400_000),
      healthCap: 70,
      happinessDrag: 5,
    };
    // A fortnight of drag on an already-floored companion.
    const after = applyAilment(
      { hunger: 15, happiness: NEED_DECAY_FLOOR, energy: 50, health: 40, coat: 15 },
      ailment,
      { from: AT, now: new Date(AT.getTime() + 14 * 86_400_000) },
    );
    expect(after.happiness).toBe(NEED_DECAY_FLOOR);
  });

  // ---- Remedies ------------------------------------------------------

  it("settles the bout, consumes one, and lifts the cap", async () => {
    await makeIll();
    const at = new Date(AT.getTime() + 3_600_000);
    const { result } = await treatPet(db, {
      userId,
      petId,
      itemId: specificRemedyId,
      idempotencyKey: randomUUID(),
      clock: clock(at),
    });
    expect(result.ailmentName).toBe("Fixture Cough");
    expect(await currentAilment(db, { petId, clock: clock(at) })).toBeNull();
    const held = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: specificRemedyId } },
    });
    expect(held.quantity).toBe(1);
  });

  it("refuses the wrong remedy WITHOUT consuming it", async () => {
    await makeIll();
    const at = new Date(AT.getTime() + 3_600_000);
    await expect(
      treatPet(db, {
        userId,
        petId,
        itemId: otherRemedyId,
        idempotencyKey: randomUUID(),
        clock: clock(at),
      }),
    ).rejects.toBeInstanceOf(AilmentError);

    // Nothing lost: not the bottle, and not the cure.
    const held = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: otherRemedyId } },
    });
    expect(held.quantity).toBe(2);
    expect(await currentAilment(db, { petId, clock: clock(at) })).not.toBeNull();
  });

  it("takes the broad tonic for anything", async () => {
    await makeIll();
    const at = new Date(AT.getTime() + 3_600_000);
    const { result } = await treatPet(db, {
      userId,
      petId,
      itemId: tonicId,
      idempotencyKey: randomUUID(),
      clock: clock(at),
    });
    expect(result.ailmentName).toBe("Fixture Cough");
  });

  it("refuses a remedy when nothing is the matter, and keeps the bottle", async () => {
    await expect(
      treatPet(db, {
        userId,
        petId,
        itemId: tonicId,
        idempotencyKey: randomUUID(),
        clock: clock(AT),
      }),
    ).rejects.toBeInstanceOf(AilmentError);
    const held = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: tonicId } },
    });
    expect(held.quantity).toBe(2);
  });

  it("replays a repeated dose instead of spending a second bottle", async () => {
    await makeIll();
    const at = new Date(AT.getTime() + 3_600_000);
    const args = {
      userId,
      petId,
      itemId: specificRemedyId,
      idempotencyKey: randomUUID(),
      clock: clock(at),
    };
    const first = await treatPet(db, args);
    const second = await treatPet(db, args);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    const held = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: specificRemedyId } },
    });
    expect(held.quantity).toBe(1);
  });

  // ---- Grooming ------------------------------------------------------

  it("raises the coat and KEEPS the tool", async () => {
    await db.pet.update({
      where: { id: petId },
      data: { coat: 40, statsUpdatedAt: AT },
    });
    const { result } = await groomPet(db, {
      userId,
      petId,
      itemId: brushId,
      idempotencyKey: randomUUID(),
      clock: clock(AT),
    });
    expect(result.coat).toBe(60);
    const held = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: brushId } },
    });
    expect(held.quantity).toBe(2);
  });

  it("rests one tool at a time — a different one still works", async () => {
    await db.pet.update({
      where: { id: petId },
      data: { coat: 20, statsUpdatedAt: AT },
    });
    await groomPet(db, {
      userId,
      petId,
      itemId: brushId,
      idempotencyKey: randomUUID(),
      clock: clock(AT),
    });
    const soon = new Date(AT.getTime() + 60_000);
    await expect(
      groomPet(db, {
        userId,
        petId,
        itemId: brushId,
        idempotencyKey: randomUUID(),
        clock: clock(soon),
      }),
    ).rejects.toBeInstanceOf(GroomError);
    // The comb is a different tool and is ready.
    const { result } = await groomPet(db, {
      userId,
      petId,
      itemId: combId,
      idempotencyKey: randomUUID(),
      clock: clock(soon),
    });
    expect(result.coat).toBeGreaterThan(20);

    // And the first one comes back after its cooldown.
    const later = new Date(AT.getTime() + (GROOM_COOLDOWN_MINUTES + 1) * 60_000);
    await expect(
      groomPet(db, {
        userId,
        petId,
        itemId: brushId,
        idempotencyKey: randomUUID(),
        clock: clock(later),
      }),
    ).resolves.toBeDefined();
  });

  it("refuses rather than absorbing a brushing an immaculate coat cannot use", async () => {
    await db.pet.update({
      where: { id: petId },
      data: { coat: STAT_MAX, statsUpdatedAt: AT },
    });
    await expect(
      groomPet(db, {
        userId,
        petId,
        itemId: brushId,
        idempotencyKey: randomUUID(),
        clock: clock(AT),
      }),
    ).rejects.toBeInstanceOf(GroomError);
  });

  // ---- Bond ----------------------------------------------------------

  it("only ever rises, through every care verb", async () => {
    await makeIll();
    const before = (await db.pet.findUniqueOrThrow({ where: { id: petId } })).bond;

    await db.pet.update({ where: { id: petId }, data: { coat: 30, statsUpdatedAt: AT } });
    await groomPet(db, {
      userId,
      petId,
      itemId: brushId,
      idempotencyKey: randomUUID(),
      clock: clock(AT),
    });
    const afterGroom = (await db.pet.findUniqueOrThrow({ where: { id: petId } })).bond;
    expect(afterGroom).toBe(before + BOND_FOR.groom);

    await treatPet(db, {
      userId,
      petId,
      itemId: tonicId,
      idempotencyKey: randomUUID(),
      clock: clock(new Date(AT.getTime() + 60_000)),
    });
    const afterTreat = (await db.pet.findUniqueOrThrow({ where: { id: petId } })).bond;
    expect(afterTreat).toBe(afterGroom + BOND_FOR.treat);
  });

  it("is never lowered by time passing", async () => {
    await db.pet.update({
      where: { id: petId },
      data: { bond: 300, statsUpdatedAt: AT },
    });
    // A month away. Decay touches the needs and nothing else.
    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    const decayed = applyStatDecay(pet, AT, new Date(AT.getTime() + 30 * 86_400_000));
    expect(Object.keys(decayed)).not.toContain("bond");
    expect(
      (await db.pet.findUniqueOrThrow({ where: { id: petId } })).bond,
    ).toBe(300);
  });
});

describe("bond bands", () => {
  it("start at the bottom and climb without gaps", () => {
    expect(bondBand(0).name).toBe(BOND_BANDS[0]!.name);
    let last = -1;
    for (const band of BOND_BANDS) {
      expect(band.minimum).toBeGreaterThan(last);
      last = band.minimum;
      expect(bondBand(band.minimum).name).toBe(band.name);
    }
  });

  it("reads full at the top rather than always saying 'not yet'", () => {
    const top = BOND_BANDS[BOND_BANDS.length - 1] as { minimum: number };
    expect(bondBandProgress(top.minimum)).toBe(1);
    expect(bondBandProgress(top.minimum * 10)).toBe(1);
  });

  it("never describes a companion as having forgotten anybody", () => {
    for (const band of BOND_BANDS) {
      expect(`${band.name} ${band.blurb}`).not.toMatch(
        /forgot|forgotten|stranger|distant|wary|neglect/i,
      );
    }
  });
});
