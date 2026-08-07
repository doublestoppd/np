/**
 * The Leaving Shelf: a free item pipe between accounts, which is exactly
 * why it is tested like one. Runs against a real PostgreSQL database.
 *
 * The interesting cases here are all adversarial rather than functional:
 * two thumbs on the last copy, a donor taking their own gift back, a lot
 * that went cold between the render and the tap, and the account made
 * twenty seconds ago that would like to carry a satchel out.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { leaveOnShelf, takeFromShelf } from "./commands";
import { getShelf } from "./queries";
import { GiveawayError } from "./errors";
import {
  DONATIONS_PER_DAY,
  OFFERING_LIFETIME_MS,
  SHELF_CAPACITY,
  TAKES_PER_DAY,
  describeFreshness,
} from "./config";
import { EconomyError } from "@/server/modules/commerce/errors";
import { FixedClock } from "@test/helpers/clock";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import {
  createTestItem,
  cleanupTestItems,
  giveStack,
} from "@test/factories/items";

const prefix = fixturePrefix("give");
const DAY = new Date("2026-03-01T09:00:00Z");
const NEXT_DAY = new Date("2026-03-02T09:00:00Z");
/** Old enough to trade, measured against the fixed clock, not wall time. */
const ESTABLISHED = new Date(DAY.getTime() - 7 * 86_400_000);

describe("freshness (pure)", () => {
  const at = (minutes: number) =>
    describeFreshness(DAY, new Date(DAY.getTime() + minutes * 60_000));

  it("describes age in words and never in time remaining", () => {
    expect(at(0)).toBe("JUST_LEFT");
    expect(at(14)).toBe("JUST_LEFT");
    expect(at(15)).toBe("RECENT");
    expect(at(74)).toBe("RECENT");
    expect(at(75)).toBe("A_WHILE");
    // Past its life entirely — still a word, never a negative number. The
    // shelf filters expired lots out; nothing ever renders a countdown.
    expect(at(200)).toBe("A_WHILE");
  });
});

async function expectGiveawayError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(GiveawayError);
  expect((error as GiveawayError).giveawayCode).toBe(code);
}

describe.skipIf(!testDb)("the leaving shelf (integration)", () => {
  const db = testDb as PrismaClient;
  let donorId: string;
  let takerId: string;
  let itemId: string;
  let otherItemId: string;

  const leave = (
    overrides: {
      userId?: string;
      itemId?: string;
      quantity?: number;
      now?: Date;
      key?: string;
    } = {},
  ) =>
    leaveOnShelf(db, {
      userId: overrides.userId ?? donorId,
      itemId: overrides.itemId ?? itemId,
      quantity: overrides.quantity ?? 1,
      idempotencyKey: overrides.key ?? randomUUID(),
      clock: new FixedClock(overrides.now ?? DAY),
    });

  const take = (
    offeringId: string,
    overrides: { userId?: string; now?: Date; key?: string } = {},
  ) =>
    takeFromShelf(db, {
      userId: overrides.userId ?? takerId,
      offeringId,
      idempotencyKey: overrides.key ?? randomUUID(),
      clock: new FixedClock(overrides.now ?? DAY),
    });

  const heldBy = async (userId: string, id = itemId) =>
    (
      await db.inventoryEntry.findUnique({
        where: { userId_itemId: { userId, itemId: id } },
      })
    )?.quantity ?? 0;

  beforeEach(async () => {
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.rateLimitWindow.deleteMany({});
    // The shelf is one shared world object with a global capacity, so
    // `roomOnShelf` is a global count. Clearing only this suite's own
    // offerings left another suite's lots (or a prior interrupted run's)
    // counting against it, which made the room assertion flake under load.
    await db.giveawayTake.deleteMany({});
    await db.giveawayOffering.deleteMany({});

    const suffix = randomUUID().slice(0, 8);
    donorId = (
      await createTestUser(db, {
        username: `${prefix}_d_${suffix}`,
        createdAt: ESTABLISHED,
      })
    ).id;
    takerId = (
      await createTestUser(db, {
        username: `${prefix}_t_${suffix}`,
        createdAt: ESTABLISHED,
      })
    ).id;

    itemId = (await createTestItem(db, { slug: `${prefix}-spare`, price: 40n }))
      .id;
    otherItemId = (
      await createTestItem(db, { slug: `${prefix}-other`, price: 12n })
    ).id;
    await giveStack(db, { userId: donorId, itemId, quantity: 20 });
    await giveStack(db, { userId: donorId, itemId: otherItemId, quantity: 20 });
  });

  afterAll(async () => {
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  // ---- Leaving ----

  it("takes the copies out of the satchel and puts them on the shelf", async () => {
    const { result } = await leave({ quantity: 3 });

    expect(result.quantity).toBe(3);
    expect(await heldBy(donorId)).toBe(17);

    const offering = await db.giveawayOffering.findUniqueOrThrow({
      where: { id: result.offeringId },
    });
    expect(offering.quantity).toBe(3);
    expect(offering.remaining).toBe(3);
    expect(offering.donationOrdinal).toBe(1);
    expect(offering.expiresAt.getTime()).toBe(
      DAY.getTime() + OFFERING_LIFETIME_MS,
    );

    const ledger = await db.transaction.findFirstOrThrow({
      where: { userId: donorId, type: "GIVEAWAY_LEAVE" },
    });
    expect(ledger.quantity).toBe(3);
    // Goods only. Nothing on this shelf moves a coin in either direction,
    // which is what makes it unable to become a faucet.
    expect(ledger.coinsDelta).toBe(0n);
  });

  it("refuses anything the player could not sell to another player", async () => {
    const bound = await createTestItem(db, {
      slug: `${prefix}-bound`,
      tradeable: false,
    });
    const unique = await createTestItem(db, {
      slug: `${prefix}-unique`,
      stackable: false,
    });
    const pulled = await createTestItem(db, {
      slug: `${prefix}-pulled`,
      lifecycle: "DISABLED",
    });
    for (const item of [bound, unique, pulled]) {
      await giveStack(db, { userId: donorId, itemId: item.id, quantity: 5 });
      await expectGiveawayError(
        leave({ itemId: item.id }),
        "NOT_DONATABLE",
      );
    }
  });

  it("cannot leave more than is in the satchel", async () => {
    await giveStack(db, { userId: donorId, itemId: otherItemId, quantity: 2 });
    const error = await leave({ itemId: otherItemId, quantity: 3 }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(EconomyError);
    expect((error as EconomyError).economyCode).toBe("INSUFFICIENT_ITEMS");
    // Nothing left the satchel, and nothing reached the shelf.
    expect(await heldBy(donorId, otherItemId)).toBe(2);
    expect(await db.giveawayOffering.count({ where: { donorId } })).toBe(0);
  });

  it("caps the day's donations and reopens the next day", async () => {
    for (let i = 0; i < DONATIONS_PER_DAY; i++) {
      await leave();
    }
    await expectGiveawayError(leave(), "GAVE_ENOUGH_TODAY");
    // Nothing was confiscated for hitting the cap.
    expect(await heldBy(donorId)).toBe(20 - DONATIONS_PER_DAY);

    const { result } = await leave({ now: NEXT_DAY });
    expect(result.remainingToday).toBe(DONATIONS_PER_DAY - 1);
  });

  it("refuses a donation when the shelf has no room, rather than evicting", async () => {
    const filler = await createTestUser(db, {
      username: `${prefix}_f_${randomUUID().slice(0, 8)}`,
      createdAt: ESTABLISHED,
    });
    await db.giveawayOffering.createMany({
      data: Array.from({ length: SHELF_CAPACITY }, (_, index) => ({
        donorId: filler.id,
        itemId: otherItemId,
        quantity: 1,
        remaining: 1,
        gameDate: "2026-03-01",
        donationOrdinal: index + 1,
        offeredAt: DAY,
        expiresAt: new Date(DAY.getTime() + OFFERING_LIFETIME_MS),
      })),
    });

    await expectGiveawayError(leave(), "SHELF_FULL");
    // A flood of cheap lots must not be able to push somebody's gift off.
    expect(
      await db.giveawayOffering.count({ where: { donorId: filler.id } }),
    ).toBe(SHELF_CAPACITY);
  });

  // ---- Taking ----

  it("hands one copy over and records both sides", async () => {
    const { result: left } = await leave({ quantity: 2 });
    const { result } = await take(left.offeringId);

    expect(result.itemSlug).toBe(`${prefix}-spare`);
    expect(await heldBy(takerId)).toBe(1);
    expect(
      (
        await db.giveawayOffering.findUniqueOrThrow({
          where: { id: left.offeringId },
        })
      ).remaining,
    ).toBe(1);

    const ledger = await db.transaction.findFirstOrThrow({
      where: { userId: takerId, type: "GIVEAWAY_TAKE" },
    });
    expect(ledger.counterpartyUserId).toBe(donorId);
    expect(ledger.quantity).toBe(1);
    expect(ledger.coinsDelta).toBe(0n);
  });

  it("will not give a donor their own gift back", async () => {
    const { result: left } = await leave();
    await expectGiveawayError(
      take(left.offeringId, { userId: donorId }),
      "YOUR_OWN",
    );
    expect(await heldBy(donorId)).toBe(19);
  });

  it("gives one per lot per player, however many are on it", async () => {
    const { result: left } = await leave({ quantity: 5 });
    await take(left.offeringId);
    await expectGiveawayError(take(left.offeringId), "ALREADY_TOOK_ONE");
    expect(await heldBy(takerId)).toBe(1);
    // The rest stayed on the shelf for other people.
    expect(
      (
        await db.giveawayOffering.findUniqueOrThrow({
          where: { id: left.offeringId },
        })
      ).remaining,
    ).toBe(4);
  });

  it("a lot that has gone cold is gone, and the copies are not returned", async () => {
    const { result: left } = await leave({ quantity: 2 });
    const after = new Date(DAY.getTime() + OFFERING_LIFETIME_MS + 1_000);

    await expectGiveawayError(take(left.offeringId, { now: after }), "GONE");
    expect(await heldBy(takerId)).toBe(0);
    // The whole point of the two hours: nothing anywhere puts them back.
    expect(await heldBy(donorId)).toBe(18);
    expect(
      (
        await db.giveawayOffering.findUniqueOrThrow({
          where: { id: left.offeringId },
        })
      ).remaining,
    ).toBe(2);
  });

  it("an emptied lot is gone too", async () => {
    const { result: left } = await leave({ quantity: 1 });
    await take(left.offeringId);

    const second = await createTestUser(db, {
      username: `${prefix}_s_${randomUUID().slice(0, 8)}`,
      createdAt: ESTABLISHED,
    });
    await expectGiveawayError(
      take(left.offeringId, { userId: second.id }),
      "GONE",
    );
  });

  it("caps the day's takes and reopens the next day", async () => {
    const lots: string[] = [];
    for (let i = 0; i < TAKES_PER_DAY + 1; i++) {
      lots.push((await leave()).result.offeringId);
    }
    for (let i = 0; i < TAKES_PER_DAY; i++) {
      await take(lots[i] as string);
    }
    await expectGiveawayError(
      take(lots[TAKES_PER_DAY] as string),
      "TOOK_ENOUGH_TODAY",
    );
    expect(await heldBy(takerId)).toBe(TAKES_PER_DAY);

    // Tomorrow's allowance needs tomorrow's shelf: today's lots went cold
    // hours ago, which is the point of the two hours.
    const tomorrow = await leave({ now: NEXT_DAY });
    await take(tomorrow.result.offeringId, { now: NEXT_DAY });
    expect(await heldBy(takerId)).toBe(TAKES_PER_DAY + 1);
  });

  it("hands out exactly what was on the lot when everyone taps at once", async () => {
    const { result: left } = await leave({ quantity: 2 });
    const takers = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createTestUser(db, {
          username: `${prefix}_r${index}_${randomUUID().slice(0, 6)}`,
          createdAt: ESTABLISHED,
        }),
      ),
    );

    const { fulfilled, rejected } = await runConcurrently(
      takers.map((taker) => () => take(left.offeringId, { userId: taker.id })),
    );

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(3);
    const offering = await db.giveawayOffering.findUniqueOrThrow({
      where: { id: left.offeringId },
    });
    expect(offering.remaining).toBe(0);
    // Two copies left the shelf and two copies arrived. A rolled-back
    // attempt must leave no inventory behind.
    const granted = await db.inventoryEntry.aggregate({
      where: { itemId, userId: { in: takers.map((t) => t.id) } },
      _sum: { quantity: true },
    });
    expect(granted._sum.quantity).toBe(2);
    expect(
      await db.giveawayTake.count({ where: { offeringId: left.offeringId } }),
    ).toBe(2);
  });

  it("replays a repeated take instead of handing over a second copy", async () => {
    const { result: left } = await leave({ quantity: 3 });
    const key = randomUUID();

    const first = await take(left.offeringId, { key });
    const second = await take(left.offeringId, { key });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result.itemSlug).toBe(first.result.itemSlug);
    expect(await heldBy(takerId)).toBe(1);
    expect(
      (
        await db.giveawayOffering.findUniqueOrThrow({
          where: { id: left.offeringId },
        })
      ).remaining,
    ).toBe(2);
  });

  // ---- The gate ----

  it("a fresh account can neither leave nor take", async () => {
    const { result: left } = await leave();

    const newborn = await createTestUser(db, {
      username: `${prefix}_n_${randomUUID().slice(0, 8)}`,
      createdAt: new Date(DAY.getTime() - 60_000),
    });
    await giveStack(db, { userId: newborn.id, itemId, quantity: 5 });

    for (const attempt of [
      leave({ userId: newborn.id }),
      take(left.offeringId, { userId: newborn.id }),
    ]) {
      const error = await attempt.then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(EconomyError);
      expect((error as EconomyError).economyCode).toBe("ACCOUNT_TOO_NEW");
    }
  });

  // ---- The shelf as it is read ----

  it("shows live lots oldest first and hides everything else", async () => {
    const older = await leave({ now: new Date(DAY.getTime() - 30 * 60_000) });
    const newer = await leave();
    const cold = await leave({
      now: new Date(DAY.getTime() - OFFERING_LIFETIME_MS - 60_000),
    });
    const emptied = await leave();
    await take(emptied.result.offeringId);

    const shelf = await getShelf(db, {
      userId: takerId,
      clock: new FixedClock(DAY),
    });
    const ids = shelf.lots.map((lot) => lot.id);

    expect(ids).toEqual([older.result.offeringId, newer.result.offeringId]);
    expect(ids).not.toContain(cold.result.offeringId);
    expect(ids).not.toContain(emptied.result.offeringId);
    expect(shelf.lots[0]?.freshness).toBe("RECENT");
    expect(shelf.lots[1]?.freshness).toBe("JUST_LEFT");
    expect(shelf.lots[0]?.donorUsername).toContain(prefix);
    expect(shelf.takesLeftToday).toBe(TAKES_PER_DAY - 1);
  });

  it("takes a lot off the shelf when its item is pulled from circulation", async () => {
    const { result: left } = await leave();
    await db.item.update({
      where: { id: itemId },
      data: { lifecycle: "DISABLED" },
    });

    const shelf = await getShelf(db, {
      userId: takerId,
      clock: new FixedClock(DAY),
    });
    expect(shelf.lots.map((lot) => lot.id)).not.toContain(left.offeringId);
    // The shelf and the take agree, which is the rule the Hollow got wrong
    // once already: a hidden thing must not still be reachable by id.
    await expectGiveawayError(take(left.offeringId), "GONE");
  });

  it("marks the viewer's own lots and the ones they have had one from", async () => {
    await giveStack(db, { userId: takerId, itemId: otherItemId, quantity: 5 });
    const mine = await leaveOnShelf(db, {
      userId: takerId,
      itemId: otherItemId,
      quantity: 1,
      idempotencyKey: randomUUID(),
      clock: new FixedClock(DAY),
    });
    const theirs = await leave({ quantity: 2 });
    await take(theirs.result.offeringId);

    const shelf = await getShelf(db, {
      userId: takerId,
      clock: new FixedClock(DAY),
    });
    const byId = new Map(shelf.lots.map((lot) => [lot.id, lot]));
    expect(byId.get(mine.result.offeringId)?.yours).toBe(true);
    expect(byId.get(theirs.result.offeringId)?.yours).toBe(false);
    expect(byId.get(theirs.result.offeringId)?.alreadyTaken).toBe(true);
    expect(byId.get(theirs.result.offeringId)?.remaining).toBe(1);
  });

  it("offers only what the viewer could actually leave", async () => {
    const bound = await createTestItem(db, {
      slug: `${prefix}-nogo`,
      tradeable: false,
    });
    await giveStack(db, { userId: donorId, itemId: bound.id, quantity: 3 });

    const shelf = await getShelf(db, {
      userId: donorId,
      clock: new FixedClock(DAY),
    });
    const ids = shelf.donatable.map((stack) => stack.itemId);
    expect(ids).toContain(itemId);
    expect(ids).not.toContain(bound.id);
    expect(shelf.roomOnShelf).toBe(SHELF_CAPACITY);
    expect(shelf.donationsLeftToday).toBe(DONATIONS_PER_DAY);
  });
});
