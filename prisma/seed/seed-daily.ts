import type { PrismaClient, WordDifficulty } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/**
 * Daily activities.
 * - Word answers: the content file is the ORDERED SOURCE OF TRUTH; the
 *   array index is the sequence position. Rows are synchronized by word:
 *   positions and active state follow the file, rows no longer present
 *   are deactivated and parked out of the rotation range (never deleted —
 *   existing puzzles reference them and stay frozen).
 * - Wheel configuration: IMMUTABLE_VERSIONED. A version already
 *   referenced by any spin can never change; seeding fails loudly and the
 *   fix is authoring a new version. Icons are presentation-only and may
 *   be refreshed in place.
 * - Meal pool: synchronized; any change to the entry set bumps the
 *   recorded configuration version (claims keep the version they saw).
 * - Historical puzzles, spins, claims, and transactions are never
 *   created or rewritten here.
 */

/**
 * Stale answers are parked at free positions >= this, far above any
 * rotation. Rows that are ALREADY inactive at or above this base are
 * never touched — they are previously parked words or intentionally
 * out-of-rotation rows (e.g. test fixtures).
 */
const PARKING_BASE = 1_000_000;

export async function seedDailyActivities(
  prisma: PrismaClient,
  daily: GameContent["daily"],
  report: SeedReport,
): Promise<void> {
  await seedWordAnswers(prisma, daily.wordAnswers, report);
  await seedWheel(prisma, daily.wheel, report);
  await seedMealPool(prisma, daily.meal, report);
}

export async function seedWordAnswers(
  prisma: PrismaClient,
  wordAnswers: GameContent["daily"]["wordAnswers"],
  report: SeedReport,
): Promise<void> {
  for (const [difficulty, entries] of Object.entries(wordAnswers) as Array<
    [WordDifficulty, GameContent["daily"]["wordAnswers"][WordDifficulty]]
  >) {
    const desired = entries.map((entry, position) => ({
      word: (typeof entry === "string" ? entry : entry.word).toUpperCase(),
      position,
      active: typeof entry === "string" ? true : entry.active,
    }));
    const existing = await prisma.dailyWordAnswer.findMany({
      where: { difficulty },
    });
    const existingByWord = new Map(existing.map((row) => [row.word, row]));
    const desiredWords = new Set(desired.map((entry) => entry.word));

    // Every position currently in use; parking and shuffle slots are
    // always drawn from FREE positions so no update can collide.
    const occupied = new Set(existing.map((row) => row.sequencePosition));
    let parkScan = PARKING_BASE;
    const freeSlotFrom = (from: number): number => {
      let slot = Math.max(from, parkScan);
      while (occupied.has(slot)) {
        slot++;
      }
      occupied.add(slot);
      parkScan = slot + 1;
      return slot;
    };

    // Rows not in the file: deactivate and park outside the rotation.
    // Rows already inactive at/above the parking base are left alone —
    // they were parked earlier or were never part of the rotation.
    for (const row of existing) {
      if (desiredWords.has(row.word)) {
        continue;
      }
      if (!row.active && row.sequencePosition >= PARKING_BASE) {
        report.record(`Word answers (${difficulty})`, "unchanged");
        continue;
      }
      await prisma.dailyWordAnswer.update({
        where: { id: row.id },
        data: { active: false, sequencePosition: freeSlotFrom(PARKING_BASE) },
      });
      occupied.delete(row.sequencePosition);
      report.record(`Word answers (${difficulty})`, "deactivated");
    }

    // Two-phase reposition: unique (difficulty, sequencePosition) makes
    // in-place swaps collide, so rows that MOVE first vacate to free
    // high slots, then land on their final authored positions.
    const movers = desired.filter((entry) => {
      const row = existingByWord.get(entry.word);
      return row !== undefined && row.sequencePosition !== entry.position;
    });
    for (const entry of movers) {
      const row = existingByWord.get(entry.word) as { id: string; sequencePosition: number };
      await prisma.dailyWordAnswer.update({
        where: { id: row.id },
        data: { sequencePosition: freeSlotFrom(PARKING_BASE) },
      });
      occupied.delete(row.sequencePosition);
    }
    for (const entry of desired) {
      const row = existingByWord.get(entry.word);
      if (!row) {
        await prisma.dailyWordAnswer.create({
          data: {
            difficulty,
            word: entry.word,
            sequencePosition: entry.position,
            active: entry.active,
          },
        });
        report.record(`Word answers (${difficulty})`, "created");
      } else if (
        row.sequencePosition === entry.position &&
        row.active === entry.active
      ) {
        report.record(`Word answers (${difficulty})`, "unchanged");
      } else {
        await prisma.dailyWordAnswer.update({
          where: { id: row.id },
          data: { sequencePosition: entry.position, active: entry.active },
        });
        report.record(`Word answers (${difficulty})`, "updated");
      }
    }
  }
}

async function seedWheel(
  prisma: PrismaClient,
  wheel: GameContent["daily"]["wheel"],
  report: SeedReport,
): Promise<void> {
  // Pools: sync entries, deactivating rows missing from content.
  const poolIds = new Map<string, string>();
  for (const pool of wheel.pools) {
    const dbPool = await prisma.dailyWheelItemPool.upsert({
      where: { slug: pool.slug },
      create: { slug: pool.slug, poolType: pool.poolType },
      update: { poolType: pool.poolType },
    });
    poolIds.set(pool.slug, dbPool.id);

    const contentEntries = new Map(
      pool.entries.map((entry) => [entry.itemSlug, entry]),
    );
    const existingEntries = await prisma.dailyWheelItemPoolEntry.findMany({
      where: { poolId: dbPool.id },
      include: { item: { select: { slug: true } } },
    });
    for (const [itemSlug, entry] of contentEntries) {
      const item = await prisma.item.findUniqueOrThrow({
        where: { slug: itemSlug },
      });
      const data = {
        selectionWeight: entry.weight,
        minimumQuantity: entry.minimumQuantity ?? 1,
        maximumQuantity: entry.maximumQuantity ?? 1,
        active: entry.active ?? true,
      };
      const existing = existingEntries.find((row) => row.item.slug === itemSlug);
      if (!existing) {
        await prisma.dailyWheelItemPoolEntry.create({
          data: { poolId: dbPool.id, itemId: item.id, ...data },
        });
        report.record("Wheel pool entries", "created");
      } else if (sameFields(existing, data)) {
        report.record("Wheel pool entries", "unchanged");
      } else {
        await prisma.dailyWheelItemPoolEntry.update({
          where: { id: existing.id },
          data,
        });
        report.record("Wheel pool entries", "updated");
      }
    }
    for (const existing of existingEntries) {
      if (!contentEntries.has(existing.item.slug) && existing.active) {
        await prisma.dailyWheelItemPoolEntry.update({
          where: { id: existing.id },
          data: { active: false },
        });
        report.record("Wheel pool entries", "deactivated");
      }
    }
  }

  const dbWheel = await prisma.dailyWheel.upsert({
    where: { slug: wheel.slug },
    create: { slug: wheel.slug, name: wheel.name },
    update: { name: wheel.name },
  });

  const desiredPrizes = wheel.configuration.prizes.map((prize) => ({
    label: prize.label,
    icon: prize.icon,
    resultType: prize.resultType,
    weight: prize.weight,
    coinAmount: prize.coinAmount ?? null,
    itemPoolId: prize.poolSlug ? (poolIds.get(prize.poolSlug) ?? null) : null,
    displayOrder: prize.displayOrder,
    flavorText: prize.flavorText ?? "",
    active: prize.active ?? true,
  }));

  const existingConfig = await prisma.dailyWheelConfiguration.findUnique({
    where: {
      wheelId_version: {
        wheelId: dbWheel.id,
        version: wheel.configuration.version,
      },
    },
    include: { prizes: { orderBy: { displayOrder: "asc" } } },
  });

  if (!existingConfig) {
    await prisma.dailyWheelConfiguration.create({
      data: {
        wheelId: dbWheel.id,
        version: wheel.configuration.version,
        active: true,
        prizes: { create: desiredPrizes },
      },
    });
    // Older versions stop being active.
    await prisma.dailyWheelConfiguration.updateMany({
      where: {
        wheelId: dbWheel.id,
        version: { not: wheel.configuration.version },
      },
      data: { active: false },
    });
    report.note(`Wheel configuration: version ${wheel.configuration.version} created`);
    report.record("Wheel configurations", "created");
    return;
  }

  const materialSame =
    existingConfig.prizes.length === desiredPrizes.length &&
    existingConfig.prizes.every((row, index) => {
      const next = desiredPrizes[index] as (typeof desiredPrizes)[number];
      return sameFields(row, {
        label: next.label,
        resultType: next.resultType,
        weight: next.weight,
        coinAmount: next.coinAmount,
        itemPoolId: next.itemPoolId,
        displayOrder: next.displayOrder,
        flavorText: next.flavorText,
        active: next.active,
      });
    });
  const iconsSame = existingConfig.prizes.every(
    (row, index) => row.icon === desiredPrizes[index]?.icon,
  );

  if (materialSame) {
    if (!iconsSame) {
      // Presentation-only refresh; recorded history is unaffected.
      for (const [index, row] of existingConfig.prizes.entries()) {
        const icon = desiredPrizes[index]?.icon;
        if (icon && icon !== row.icon) {
          await prisma.dailyWheelPrize.update({
            where: { id: row.id },
            data: { icon },
          });
        }
      }
      report.record("Wheel configurations", "updated");
    } else {
      report.record("Wheel configurations", "unchanged");
    }
    return;
  }

  const spins = await prisma.dailyWheelSpin.count({
    where: { configurationId: existingConfig.id },
  });
  if (spins > 0) {
    throw new Error(
      `Wheel configuration v${wheel.configuration.version} of "${wheel.slug}" differs from content but is already referenced by ${spins} recorded spin(s). ` +
        `Versions are immutable once played: author a NEW configuration version in prisma/content/daily/prize-wheel.ts instead of editing v${wheel.configuration.version}.`,
    );
  }
  // Unreferenced version: safe to replace wholesale.
  await prisma.dailyWheelPrize.deleteMany({
    where: { configurationId: existingConfig.id },
  });
  await prisma.dailyWheelConfiguration.update({
    where: { id: existingConfig.id },
    data: { active: true, prizes: { create: desiredPrizes } },
  });
  report.record("Wheel configurations", "updated");
}

async function seedMealPool(
  prisma: PrismaClient,
  meal: GameContent["daily"]["meal"],
  report: SeedReport,
): Promise<void> {
  const preexisting = await prisma.dailyFoodPool.findUnique({
    where: { slug: meal.slug },
  });
  const pool =
    preexisting ??
    (await prisma.dailyFoodPool.create({ data: { slug: meal.slug } }));
  const contentEntries = new Map(
    meal.entries.map((entry) => [entry.itemSlug, entry]),
  );
  const existingEntries = await prisma.dailyFoodPoolEntry.findMany({
    where: { poolId: pool.id },
    include: { item: { select: { slug: true } } },
  });
  let changed = false;
  for (const [itemSlug, entry] of contentEntries) {
    const item = await prisma.item.findUniqueOrThrow({
      where: { slug: itemSlug },
    });
    const data = {
      selectionWeight: entry.weight,
      quantity: entry.quantity ?? 1,
      active: entry.active ?? true,
    };
    const existing = existingEntries.find((row) => row.item.slug === itemSlug);
    if (!existing) {
      await prisma.dailyFoodPoolEntry.create({
        data: { poolId: pool.id, itemId: item.id, ...data },
      });
      report.record("Meal pool entries", "created");
      changed = true;
    } else if (sameFields(existing, data)) {
      report.record("Meal pool entries", "unchanged");
    } else {
      await prisma.dailyFoodPoolEntry.update({ where: { id: existing.id }, data });
      report.record("Meal pool entries", "updated");
      changed = true;
    }
  }
  for (const existing of existingEntries) {
    if (!contentEntries.has(existing.item.slug) && existing.active) {
      await prisma.dailyFoodPoolEntry.update({
        where: { id: existing.id },
        data: { active: false },
      });
      report.record("Meal pool entries", "deactivated");
      changed = true;
    }
  }
  // Initial population keeps version 1; later changes bump the recorded
  // version (claims keep the version they were served under).
  if (changed && preexisting) {
    const bumped = await prisma.dailyFoodPool.update({
      where: { id: pool.id },
      data: { configurationVersion: { increment: 1 } },
    });
    report.note(`Meal pool: configuration version is now ${bumped.configurationVersion}`);
  }
}
