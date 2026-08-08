import type { PrismaClient } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/**
 * Ailment kinds and remedies (ADR-60).
 *
 * Kinds are DEACTIVATED rather than deleted when they leave the content
 * file: `PetAilment` rows reference a kind forever, and a companion's
 * history of having had a cough last spring must stay readable after the
 * cough is retired. The domain draws only from active kinds, so retiring
 * one stops it happening again without rewriting what already happened.
 */
export async function seedPetCare(
  prisma: PrismaClient,
  pets: GameContent["pets"],
  report: SeedReport,
): Promise<void> {
  const authoredKeys: string[] = [];
  for (const ailment of pets.ailments) {
    authoredKeys.push(ailment.key);
    const fields = {
      name: ailment.name,
      symptom: ailment.symptom,
      comfort: ailment.comfort,
      restHours: ailment.restHours,
      happinessDrag: ailment.happinessDrag ?? 1,
      healthCap: ailment.healthCap ?? 70,
      active: ailment.active ?? true,
    };
    const existing = await prisma.ailmentKind.findUnique({
      where: { key: ailment.key },
    });
    if (!existing) {
      await prisma.ailmentKind.create({ data: { key: ailment.key, ...fields } });
      report.record("Ailments", "created");
    } else if (sameFields(existing, fields)) {
      report.record("Ailments", "unchanged");
    } else {
      await prisma.ailmentKind.update({
        where: { key: ailment.key },
        data: fields,
      });
      report.record("Ailments", "updated");
    }
  }

  const retired = await prisma.ailmentKind.updateMany({
    where: { key: { notIn: authoredKeys }, active: true },
    data: { active: false },
  });
  for (let i = 0; i < retired.count; i += 1) {
    report.record("Ailments", "deactivated");
  }

  for (const remedy of pets.remedies) {
    const item = await prisma.item.findUniqueOrThrow({
      where: { slug: remedy.itemSlug },
      select: { id: true },
    });
    // A null key is the broad tonic and is not a lookup failure.
    const kind =
      remedy.ailmentKey === null
        ? null
        : await prisma.ailmentKind.findUniqueOrThrow({
            where: { key: remedy.ailmentKey },
            select: { id: true },
          });
    const fields = { kindId: kind?.id ?? null, comfort: remedy.comfort ?? 5 };
    const existing = await prisma.remedy.findUnique({
      where: { itemId: item.id },
    });
    if (!existing) {
      await prisma.remedy.create({ data: { itemId: item.id, ...fields } });
      report.record("Remedies", "created");
    } else if (sameFields(existing, fields)) {
      report.record("Remedies", "unchanged");
    } else {
      await prisma.remedy.update({ where: { itemId: item.id }, data: fields });
      report.record("Remedies", "updated");
    }
  }
}
