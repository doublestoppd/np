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
 * that no longer exists in the picture cannot be rendered.
 *
 * `HollowPlacement.anchorKey` is a plain string with no foreign key, so
 * nothing drops those placements for us — and a placement pointing at a
 * vanished anchor is worse than a deleted one. It renders nowhere (scenes
 * are composed by mapping over the anchors that exist), it still counts
 * against the player's placed total, so `listPlaceable` will not offer the
 * copy anywhere else, and no clear control can reach it because the UI only
 * draws chips for real anchors. The furnishing is paid for, invisible, and
 * unrecoverable. So removed anchors take their placements with them,
 * explicitly, here — the copy returns to the player's spare pool.
 *
 * Anchor keys are stable content (prisma/content/README.md) for exactly
 * this reason: renaming one costs somebody their arrangement.
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
      // Placements at keys that no longer exist would be stranded, so they
      // go first — while the scenes that hold them are still identifiable.
      const authoredKeys = authored.map((anchor) => anchor.key);
      const stranded = await prisma.hollowPlacement.deleteMany({
        where: {
          scene: { groundId: row.id },
          anchorKey: { notIn: authoredKeys },
        },
      });
      if (stranded.count > 0) {
        report.note(
          `Hollow: ${stranded.count} placement(s) removed with anchors that no longer exist in "${ground.key}"`,
        );
      }
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
