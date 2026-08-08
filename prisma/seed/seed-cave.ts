import type { PrismaClient } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/**
 * The Sunken Stair (ADR-59): the ten rooms and the hoard.
 *
 * Sections are keyed by depth and UPSERTED — the prose can be rewritten
 * freely, because no player row references a section. `CaveDelve` stores
 * a seed and a choice log, and both are independent of what the rooms
 * are called.
 *
 * Hoard entries are DEACTIVATED rather than deleted when they leave the
 * content file, the same rule the fishing and forage tables follow: a
 * `CaveDelve.prizeItemId` points at an item forever, and the row is a
 * record of what somebody carried out.
 */
export async function seedCave(
  prisma: PrismaClient,
  cave: GameContent["cave"],
  report: SeedReport,
): Promise<void> {
  for (const section of cave.sections) {
    const fields = {
      name: section.name,
      description: section.description,
      doorOne: section.doorOne,
      doorTwo: section.doorTwo,
      turnedBackFlavor: section.turnedBackFlavor,
      onwardFlavor: section.onwardFlavor,
    };
    const existing = await prisma.caveSection.findUnique({
      where: { sectionIndex: section.sectionIndex },
    });
    if (!existing) {
      await prisma.caveSection.create({
        data: { sectionIndex: section.sectionIndex, ...fields },
      });
      report.record("Cave sections", "created");
    } else if (sameFields(existing, fields)) {
      report.record("Cave sections", "unchanged");
    } else {
      await prisma.caveSection.update({
        where: { sectionIndex: section.sectionIndex },
        data: fields,
      });
      report.record("Cave sections", "updated");
    }
  }

  // A room that has left the content file is removed: nothing references
  // it, and a stale eleventh room would make the descent the wrong depth,
  // which the domain refuses to run at all.
  const authoredDepths = cave.sections.map((section) => section.sectionIndex);
  const removed = await prisma.caveSection.deleteMany({
    where: { sectionIndex: { notIn: authoredDepths } },
  });
  for (let i = 0; i < removed.count; i += 1) {
    report.record("Cave sections", "deactivated");
  }

  const authoredItems: string[] = [];
  for (const entry of cave.hoard) {
    const item = await prisma.item.findUniqueOrThrow({
      where: { slug: entry.itemSlug },
      select: { id: true },
    });
    authoredItems.push(item.id);
    const fields = {
      selectionWeight: entry.selectionWeight,
      active: entry.active ?? true,
    };
    const existing = await prisma.caveHoardEntry.findUnique({
      where: { itemId: item.id },
    });
    if (!existing) {
      await prisma.caveHoardEntry.create({ data: { itemId: item.id, ...fields } });
      report.record("Cave hoard", "created");
    } else if (sameFields(existing, fields)) {
      report.record("Cave hoard", "unchanged");
    } else {
      await prisma.caveHoardEntry.update({
        where: { itemId: item.id },
        data: fields,
      });
      report.record("Cave hoard", "updated");
    }
  }

  const retired = await prisma.caveHoardEntry.updateMany({
    where: { itemId: { notIn: authoredItems }, active: true },
    data: { active: false },
  });
  for (let i = 0; i < retired.count; i += 1) {
    report.record("Cave hoard", "deactivated");
  }
}
