import type { PrismaClient } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/**
 * Categories, tags, items: UPSERT_ONLY. Removing an item from content
 * never deletes or deactivates it in the database — players may own it.
 * Retire or disable items explicitly via the `lifecycle` field.
 */
export async function seedItems(
  prisma: PrismaClient,
  content: Pick<GameContent, "categories" | "tags" | "items" | "scratchCards">,
  report: SeedReport,
): Promise<void> {
  for (const category of content.categories) {
    const existing = await prisma.itemCategory.findUnique({
      where: { slug: category.slug },
    });
    if (!existing) {
      await prisma.itemCategory.create({ data: category });
      report.record("Categories", "created");
    } else if (sameFields(existing, category)) {
      report.record("Categories", "unchanged");
    } else {
      await prisma.itemCategory.update({
        where: { slug: category.slug },
        data: category,
      });
      report.record("Categories", "updated");
    }
  }

  for (const tag of content.tags) {
    const existing = await prisma.itemTag.findUnique({ where: { slug: tag.slug } });
    if (!existing) {
      await prisma.itemTag.create({ data: tag });
      report.record("Tags", "created");
    } else if (sameFields(existing, tag)) {
      report.record("Tags", "unchanged");
    } else {
      await prisma.itemTag.update({ where: { slug: tag.slug }, data: tag });
      report.record("Tags", "updated");
    }
  }

  for (const item of content.items) {
    const scalar = {
      name: item.name,
      description: item.description,
      type: item.type,
      price: item.price,
      rarity: item.rarity,
      lifecycle: item.lifecycle ?? "ACTIVE",
      tradeable: item.tradeable ?? true,
      stackable: item.stackable ?? true,
      provenancePolicy: item.provenancePolicy ?? "NONE",
      artKey: item.artKey,
      hungerRestore: item.hungerRestore ?? null,
      happinessBoost: item.happinessBoost ?? null,
    };
    const tagRefs = item.tags.map((slug) => ({ slug }));
    const existing = await prisma.item.findUnique({
      where: { slug: item.slug },
      include: { tags: { select: { slug: true } } },
    });
    if (!existing) {
      await prisma.item.create({
        data: {
          slug: item.slug,
          ...scalar,
          category: { connect: { slug: item.category } },
          tags: { connect: tagRefs },
        },
      });
      report.record("Items", "created");
      continue;
    }
    const existingCategory = await prisma.itemCategory.findUnique({
      where: { slug: item.category },
      select: { id: true },
    });
    const sameTags =
      existing.tags.length === tagRefs.length &&
      existing.tags.every((tag) => item.tags.includes(tag.slug));
    if (
      sameFields(existing, scalar) &&
      existing.categoryId === existingCategory?.id &&
      sameTags
    ) {
      report.record("Items", "unchanged");
    } else {
      await prisma.item.update({
        where: { slug: item.slug },
        data: {
          ...scalar,
          category: { connect: { slug: item.category } },
          tags: { set: tagRefs },
        },
      });
      report.record("Items", "updated");
    }
  }

  // Furnishing side rows: what fits where, and how long it takes to
  // finish. Keyed by itemId, so this runs after the items exist.
  for (const item of content.items) {
    if (!item.furnishing) continue;
    const row = await prisma.item.findUniqueOrThrow({
      where: { slug: item.slug },
      select: { id: true },
    });
    const data = {
      size: item.furnishing.size,
      growthDays: item.furnishing.growthDays ?? null,
    };
    const existing = await prisma.furnishing.findUnique({
      where: { itemId: row.id },
    });
    if (!existing) {
      await prisma.furnishing.create({ data: { itemId: row.id, ...data } });
      report.record("Furnishings", "created");
    } else if (sameFields(existing, data)) {
      report.record("Furnishings", "unchanged");
    } else {
      await prisma.furnishing.update({ where: { itemId: row.id }, data });
      report.record("Furnishings", "updated");
    }
  }

  // Scratch-card prize tables. Keyed by itemId, so this runs after the
  // items exist, and after every prize item exists too.
  //
  // SYNC_AND_DEACTIVATE_MISSING by display order: an outcome dropped from
  // the file is deactivated rather than deleted, because ScratchResult
  // rows point at it and history must keep resolving to what a player
  // actually won.
  for (const card of content.scratchCards) {
    const cardItem = await prisma.item.findUniqueOrThrow({
      where: { slug: card.itemSlug },
      select: { id: true },
    });
    const existingCard = await prisma.scratchCard.findUnique({
      where: { itemId: cardItem.id },
    });
    if (!existingCard) {
      await prisma.scratchCard.create({
        data: { itemId: cardItem.id, tier: card.tier },
      });
      report.record("Scratch cards", "created");
    } else if (existingCard.tier === card.tier) {
      report.record("Scratch cards", "unchanged");
    } else {
      await prisma.scratchCard.update({
        where: { itemId: cardItem.id },
        data: { tier: card.tier },
      });
      report.record("Scratch cards", "updated");
    }

    const authored = new Set<number>();
    for (const [displayOrder, prize] of card.prizes.entries()) {
      authored.add(displayOrder);
      const prizeItemId =
        prize.itemSlug === undefined
          ? null
          : (
              await prisma.item.findUniqueOrThrow({
                where: { slug: prize.itemSlug },
                select: { id: true },
              })
            ).id;
      const data = {
        label: prize.label,
        kind: prize.kind,
        weight: prize.weight,
        coinAmount: prize.coins ?? null,
        prizeItemId,
        quantity: prize.quantity ?? 1,
        active: prize.active ?? true,
      };
      const existing = await prisma.scratchPrize.findUnique({
        where: {
          cardItemId_displayOrder: { cardItemId: cardItem.id, displayOrder },
        },
      });
      if (!existing) {
        await prisma.scratchPrize.create({
          data: { cardItemId: cardItem.id, displayOrder, ...data },
        });
        report.record("Scratch prizes", "created");
      } else if (sameFields(existing, data)) {
        report.record("Scratch prizes", "unchanged");
      } else {
        await prisma.scratchPrize.update({ where: { id: existing.id }, data });
        report.record("Scratch prizes", "updated");
      }
    }

    const orphaned = await prisma.scratchPrize.findMany({
      where: { cardItemId: cardItem.id, active: true },
    });
    for (const row of orphaned) {
      if (!authored.has(row.displayOrder)) {
        await prisma.scratchPrize.update({
          where: { id: row.id },
          data: { active: false },
        });
        report.record("Scratch prizes", "deactivated");
      }
    }
  }
}
