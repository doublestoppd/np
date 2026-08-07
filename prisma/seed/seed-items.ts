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
  content: Pick<GameContent, "categories" | "tags" | "items">,
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
}
