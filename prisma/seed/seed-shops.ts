import type { PrismaClient } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/**
 * NPC shops and restock configs: UPSERT_ONLY. Pool entries:
 * SYNC_AND_DEACTIVATE_MISSING within each shop — entries removed from
 * content are deactivated (never deleted; restock history references
 * them). Upgrade tiers: UPSERT with an explicit active flag.
 */
export async function seedShops(
  prisma: PrismaClient,
  content: Pick<GameContent, "npcShops" | "upgradeTiers">,
  report: SeedReport,
): Promise<void> {
  for (const shop of content.npcShops) {
    // Location slugs are region-scoped, never globally unique — always
    // resolve through the region (prisma/seed/validation.ts enforces the
    // same addressing offline).
    const location = await prisma.location.findFirstOrThrow({
      where: { slug: shop.locationSlug, region: { slug: shop.regionSlug } },
    });
    const shopData = {
      name: shop.name,
      description: shop.description,
      keeperCopy: shop.keeperCopy ?? "",
      keeperArtKey: shop.keeperArtKey ?? null,
      artKey: shop.artKey ?? null,
      locationId: location.id,
    };
    let dbShop = await prisma.npcShop.findUnique({ where: { slug: shop.slug } });
    if (!dbShop) {
      dbShop = await prisma.npcShop.create({
        data: { slug: shop.slug, ...shopData },
      });
      report.record("NPC shops", "created");
    } else if (sameFields(dbShop, shopData)) {
      report.record("NPC shops", "unchanged");
    } else {
      dbShop = await prisma.npcShop.update({
        where: { slug: shop.slug },
        data: shopData,
      });
      report.record("NPC shops", "updated");
    }

    await prisma.npcShopRestockConfig.upsert({
      where: { shopId: dbShop.id },
      create: { shopId: dbShop.id, ...shop.config },
      update: shop.config ?? {},
    });

    // Pool entries: sync, deactivating rows missing from content.
    const contentEntries = new Map(
      shop.pool.map((entry) => [entry.itemSlug, entry]),
    );
    const existingEntries = await prisma.npcShopPoolEntry.findMany({
      where: { shopId: dbShop.id },
      include: { item: { select: { slug: true } } },
    });
    const existingBySlug = new Map(
      existingEntries.map((entry) => [entry.item.slug, entry]),
    );

    for (const [itemSlug, entry] of contentEntries) {
      const item = await prisma.item.findUniqueOrThrow({
        where: { slug: itemSlug },
      });
      const data = {
        shopRarity: entry.shopRarity,
        price: entry.price,
        weight: entry.weight,
        minQuantity: entry.minQuantity,
        maxQuantity: entry.maxQuantity,
        availableUntil: entry.availableUntil
          ? new Date(entry.availableUntil)
          : null,
        active: true,
      };
      const existing = existingBySlug.get(itemSlug);
      if (!existing) {
        await prisma.npcShopPoolEntry.create({
          data: { shopId: dbShop.id, itemId: item.id, ...data },
        });
        report.record("NPC shop pool entries", "created");
      } else if (sameFields(existing, data)) {
        report.record("NPC shop pool entries", "unchanged");
      } else {
        await prisma.npcShopPoolEntry.update({
          where: { id: existing.id },
          data,
        });
        report.record("NPC shop pool entries", "updated");
      }
    }
    for (const existing of existingEntries) {
      if (!contentEntries.has(existing.item.slug) && existing.active) {
        await prisma.npcShopPoolEntry.update({
          where: { id: existing.id },
          data: { active: false },
        });
        report.record("NPC shop pool entries", "deactivated");
      }
    }
  }

  for (const tier of content.upgradeTiers) {
    const data = {
      name: tier.name,
      price: tier.price,
      capacityBonus: tier.capacityBonus,
      active: tier.active ?? true,
    };
    const existing = await prisma.playerShopUpgradeTier.findUnique({
      where: { tier: tier.tier },
    });
    if (!existing) {
      await prisma.playerShopUpgradeTier.create({
        data: { tier: tier.tier, ...data },
      });
      report.record("Upgrade tiers", "created");
    } else if (sameFields(existing, data)) {
      report.record("Upgrade tiers", "unchanged");
    } else {
      await prisma.playerShopUpgradeTier.update({
        where: { tier: tier.tier },
        data,
      });
      report.record("Upgrade tiers", "updated");
    }
  }
}
