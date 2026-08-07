/**
 * Reconciliation detects seeded inconsistencies and stays quiet on clean
 * accounts. Corrupt states are inserted directly (bypassing commands —
 * the commands themselves cannot produce them); states the database CHECK
 * constraints forbid (negative balances/quantities) cannot be seeded and
 * are covered by the constraints instead.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { runReconciliation, type ReconciliationFinding } from "./reconciliation";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";
import { createTestNpcShop, cleanupTestNpcShops } from "@test/factories/npc-shops";

const prefix = fixturePrefix("recon");

describe.skipIf(!testDb)("economy reconciliation (integration)", () => {
  const db = testDb as PrismaClient;
  const userIds: string[] = [];
  const expected: Array<{ check: string; subject: string }> = [];
  let cleanUserId: string;
  let mySubjects: Set<string>;

  function findingsForFixtures(findings: ReconciliationFinding[]) {
    return findings.filter((finding) => mySubjects.has(finding.subject));
  }

  beforeAll(async () => {
    const user = async (suffix: string, coins = 200n) => {
      const created = await createTestUser(db, {
        username: `${prefix}_${suffix}`,
        coins,
      });
      userIds.push(created.id);
      return created;
    };

    cleanUserId = (await user("clean")).id;

    // 1. Wallet drifted from what the ledger explains (start = 200).
    const drifted = await user("drift", 999n);
    expected.push({ check: "wallet-ledger-mismatch", subject: drifted.id });

    const relic = await createTestItem(db, {
      slug: `${prefix}-relic`,
      stackable: false,
    });

    // 2. ESCROWED instance with no active listing behind it.
    const orphanOwner = await user("orphan");
    const orphan = await db.itemInstance.create({
      data: {
        itemId: relic.id,
        ownerId: orphanOwner.id,
        status: "ESCROWED",
        acquisitionSource: "test",
      },
    });
    expected.push({ check: "orphaned-escrow", subject: orphan.id });

    // 3. ACTIVE instance listing whose instance never entered escrow.
    const badSeller = await user("badescrow");
    const badShop = await db.playerShop.create({
      data: {
        ownerId: badSeller.id,
        slug: `${prefix}-badshop`,
        name: "Bad Shop",
        listingCapacity: 8,
      },
    });
    const unescrowed = await db.itemInstance.create({
      data: {
        itemId: relic.id,
        ownerId: badSeller.id,
        status: "OWNED",
        acquisitionSource: "test",
      },
    });
    const badListing = await db.playerShopListing.create({
      data: {
        shopId: badShop.id,
        sellerId: badSeller.id,
        itemId: relic.id,
        itemInstanceId: unescrowed.id,
        quantity: 1,
        quantityListed: 1,
        unitPrice: 10n,
        status: "ACTIVE",
      },
    });
    expected.push({ check: "listing-without-escrow", subject: badListing.id });

    // 4. SOLD listing missing its buyer and ledger rows. The shop totals
    // are kept consistent so only the sale check fires for it.
    const stack = await createTestItem(db, { slug: `${prefix}-stack` });
    const saleSeller = await user("badsale");
    const saleShop = await db.playerShop.create({
      data: {
        ownerId: saleSeller.id,
        slug: `${prefix}-saleshop`,
        name: "Sale Shop",
        listingCapacity: 8,
        lifetimeRevenue: 50n,
        unclaimedProceeds: 50n,
      },
    });
    const badSale = await db.playerShopListing.create({
      data: {
        shopId: saleShop.id,
        sellerId: saleSeller.id,
        itemId: stack.id,
        // Emptied and closed, but no ledger rows explain where the unit
        // went — the shape a lost write would leave behind.
        quantity: 0,
        quantityListed: 1,
        unitPrice: 50n,
        status: "SOLD",
      },
    });
    expected.push({ check: "sale-units-mismatch", subject: badSale.id });

    // 5. Recorded revenue no sale explains.
    const revenueOwner = await user("badrev");
    const revenueShop = await db.playerShop.create({
      data: {
        ownerId: revenueOwner.id,
        slug: `${prefix}-revshop`,
        name: "Rev Shop",
        listingCapacity: 8,
        lifetimeRevenue: 123n,
      },
    });
    expected.push({ check: "revenue-mismatch", subject: revenueShop.id });

    // 6. NPC stock depleted with no purchases in the ledger.
    const npc = await createTestNpcShop(db, { prefix });
    const stockRow = await db.npcShopStock.create({
      data: {
        shopId: npc.shop.id,
        itemId: stack.id,
        restockId: npc.restock.id,
        price: 10n,
        quantity: 3,
        initialQuantity: 5,
        status: "ACTIVE",
      },
    });
    expected.push({ check: "npc-stock-mismatch", subject: stockRow.id });

    // 7. Idempotency record started over an hour ago, never completed.
    const staleUser = await user("stale");
    const stale = await db.idempotencyKey.create({
      data: {
        userId: staleUser.id,
        operation: "npc-purchase",
        key: "stuck",
        requestHash: "h",
        createdAt: new Date(Date.now() - 2 * 3_600_000),
      },
    });
    expected.push({ check: "stale-idempotency", subject: stale.id });

    // 8. A pet with no starter claim, and a claim naming a pet the claimant
    // does not own.
    const species = await db.petSpecies.create({
      data: { slug: `${prefix}-species`, name: "S", description: "", artKey: "s" },
    });
    const petOwner = await user("petnoclaim");
    const pet = await db.pet.create({
      data: { name: "Stray", ownerId: petOwner.id, speciesId: species.id },
    });
    expected.push({ check: "pet-without-starter-claim", subject: petOwner.id });
    const wrongClaimant = await user("wrongclaim");
    const wrongClaim = await db.starterClaim.create({
      data: { userId: wrongClaimant.id, petId: pet.id },
    });
    expected.push({ check: "starter-claim-wrong-owner", subject: wrongClaim.id });

    // 9. Showcase entry for an instanced item with no instance reference.
    const showcaseUser = await user("badshow");
    const badEntry = await db.showcaseEntry.create({
      data: {
        userId: showcaseUser.id,
        itemId: relic.id,
        itemInstanceId: null,
        position: 0,
      },
    });
    expected.push({ check: "invalid-showcase-reference", subject: badEntry.id });

    // 10-12. Daily activities: rewards recorded without their ledger rows.
    const gameDate = `${2100 + Math.floor(Math.random() * 800)}-06-15`;
    const fixtureWord = Array.from({ length: 6 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join("");
    const answer = await db.dailyWordAnswer.upsert({
      where: { difficulty_word: { difficulty: "HARD", word: fixtureWord } },
      create: {
        difficulty: "HARD",
        word: fixtureWord,
        sequencePosition: 3_000_000 + Math.floor(Math.random() * 900_000),
        active: false,
      },
      update: {},
    });
    const puzzle = await db.dailyWordPuzzle.create({
      data: {
        gameDate,
        difficulty: "HARD",
        band: 0,
        answerId: answer.id,
        rewardCoins: 500n,
      },
    });
    const wordUser = await user("badword");
    const solvedNoLedger = await db.dailyWordResult.create({
      data: {
        userId: wordUser.id,
        puzzleId: puzzle.id,
        status: "SOLVED",
        attemptsUsed: 2,
        rewardCoins: 500n,
        solvedAt: new Date(),
      },
    });
    expected.push({ check: "word-reward-mismatch", subject: solvedNoLedger.id });

    const wheelUser = await user("badspin");
    const wheel = await db.dailyWheel.create({
      data: { slug: `${prefix}-wheel`, name: "Fixture Wheel" },
    });
    const wheelConfig = await db.dailyWheelConfiguration.create({
      data: { wheelId: wheel.id, version: 1 },
    });
    const nothingPrize = await db.dailyWheelPrize.create({
      data: {
        configurationId: wheelConfig.id,
        label: "Nothing",
        resultType: "NOTHING",
        weight: 10_000,
        displayOrder: 0,
      },
    });
    // A NOTHING prize that somehow recorded coins, with no ledger row.
    const nothingSpin = await db.dailyWheelSpin.create({
      data: {
        userId: wheelUser.id,
        wheelId: wheel.id,
        gameDate,
        configurationId: wheelConfig.id,
        prizeId: nothingPrize.id,
        awardedCoins: 5n,
        idempotencyKey: "fixture",
      },
    });
    expected.push({ check: "wheel-reward-mismatch", subject: nothingSpin.id });

    const foodUser = await user("badmeal");
    const foodPool = await db.dailyFoodPool.create({
      data: { slug: `${prefix}-pool` },
    });
    const claimNoLedger = await db.dailyFoodClaim.create({
      data: {
        userId: foodUser.id,
        gameDate,
        poolId: foodPool.id,
        poolConfigurationVersion: 1,
        awardedItemId: stack.id,
        awardedQuantity: 1,
        idempotencyKey: "fixture",
      },
    });
    expected.push({ check: "food-claim-mismatch", subject: claimNoLedger.id });

    mySubjects = new Set([
      ...userIds,
      ...expected.map((finding) => finding.subject),
    ]);
  });

  afterAll(async () => {
    await db.dailyWheelSpin.deleteMany({
      where: { wheel: { slug: { startsWith: prefix } } },
    });
    await db.dailyWheelConfiguration.deleteMany({
      where: { wheel: { slug: { startsWith: prefix } } },
    });
    await db.dailyWheel.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.dailyFoodClaim.deleteMany({
      where: { pool: { slug: { startsWith: prefix } } },
    });
    await db.dailyFoodPool.deleteMany({
      where: { slug: { startsWith: prefix } },
    });
    await cleanupTestNpcShops(db, prefix);
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.petSpecies.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("flags every seeded inconsistency exactly once, and nothing else", async () => {
    const findings = findingsForFixtures(
      await runReconciliation(db, { userIds }),
    );
    const got = findings
      .map((finding) => ({ check: finding.check, subject: finding.subject }))
      .sort((a, b) =>
        `${a.check}:${a.subject}`.localeCompare(`${b.check}:${b.subject}`),
      );
    const want = [...expected].sort((a, b) =>
      `${a.check}:${a.subject}`.localeCompare(`${b.check}:${b.subject}`),
    );
    expect(got).toEqual(want);
  });

  it("reports nothing for a clean account", async () => {
    const findings = await runReconciliation(db, { userIds: [cleanUserId] });
    expect(findings.filter((f) => f.subject === cleanUserId)).toEqual([]);
  });
});
