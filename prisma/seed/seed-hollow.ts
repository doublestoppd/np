import type { PrismaClient } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/**
 * Grounds, their anchors, the ground price ladder, and airs: UPSERT_ONLY,
 * like every other content domain. Nothing here is ever deleted from a
 * live database — a player's Hollow may be standing on it.
 *
 * Anchors are the one exception to "never delete": they are replaced
 * wholesale for a ground whose authored set has changed, because an anchor
 * that no longer exists in the picture cannot be rendered. Placements at a
 * removed anchor are dropped with it, which is why anchor keys are treated
 * as stable content (prisma/content/README.md) and renamed only
 * deliberately.
 */
export async function seedHollow(
  prisma: PrismaClient,
  content: GameContent["hollow"],
  report: SeedReport,
): Promise<void> {
  for (const [index, ground] of content.grounds.entries()) {
    const scalar = {
      name: ground.name,
      description: ground.description,
      artKey: ground.artKey,
      sortOrder: index,
    };
    const existing = await prisma.hollowGroundDefinition.findUnique({
      where: { key: ground.key },
      include: { anchors: true },
    });
    const row = existing
      ? await (async () => {
          if (!sameFields(existing, scalar)) {
            report.record("Hollow grounds", "updated");
            return prisma.hollowGroundDefinition.update({
              where: { key: ground.key },
              data: scalar,
            });
          }
          report.record("Hollow grounds", "unchanged");
          return existing;
        })()
      : await (async () => {
          report.record("Hollow grounds", "created");
          return prisma.hollowGroundDefinition.create({
            data: { key: ground.key, ...scalar },
          });
        })();

    const authored = ground.anchors.map((anchor) => ({
      key: anchor.key,
      label: anchor.label,
      maxSize: anchor.maxSize,
      x: Math.round(anchor.x),
      y: Math.round(anchor.y),
      depth: anchor.depth,
    }));
    const current = existing?.anchors ?? [];
    const unchanged =
      current.length === authored.length &&
      authored.every((anchor) => {
        const match = current.find((candidate) => candidate.key === anchor.key);
        return match !== undefined && sameFields(match, anchor);
      });
    if (unchanged) {
      report.record("Hollow anchors", "unchanged", authored.length);
    } else {
      await prisma.hollowAnchorDefinition.deleteMany({
        where: { groundId: row.id },
      });
      await prisma.hollowAnchorDefinition.createMany({
        data: authored.map((anchor) => ({ groundId: row.id, ...anchor })),
      });
      report.record(
        "Hollow anchors",
        current.length === 0 ? "created" : "updated",
        authored.length,
      );
    }
  }

  for (const rung of content.groundPrices) {
    const existing = await prisma.hollowGroundPrice.findUnique({
      where: { heldCount: rung.order },
    });
    if (!existing) {
      await prisma.hollowGroundPrice.create({
        data: { heldCount: rung.order, price: rung.price },
      });
      report.record("Hollow ground prices", "created");
    } else if (existing.price === rung.price) {
      report.record("Hollow ground prices", "unchanged");
    } else {
      await prisma.hollowGroundPrice.update({
        where: { heldCount: rung.order },
        data: { price: rung.price },
      });
      report.record("Hollow ground prices", "updated");
    }
  }

  for (const air of content.airs) {
    const scalar = {
      name: air.name,
      description: air.description,
      price: air.price,
      sortOrder: air.sortOrder,
    };
    const existing = await prisma.hollowAirDefinition.findUnique({
      where: { key: air.key },
    });
    if (!existing) {
      await prisma.hollowAirDefinition.create({
        data: { key: air.key, ...scalar },
      });
      report.record("Hollow airs", "created");
    } else if (sameFields(existing, scalar)) {
      report.record("Hollow airs", "unchanged");
    } else {
      await prisma.hollowAirDefinition.update({
        where: { key: air.key },
        data: scalar,
      });
      report.record("Hollow airs", "updated");
    }
  }
}
