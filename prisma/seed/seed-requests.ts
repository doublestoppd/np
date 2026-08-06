import type { PrismaClient } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/**
 * Request boards: UPSERT boards and their authored requests, and
 * DEACTIVATE (never delete) requests that leave the content file — player
 * progress and completion history reference definitions forever.
 *
 * Sequence positions are uniquely constrained per board, so movers are
 * parked at negative slots before the authored values are written, exactly
 * like word answers and location attachments.
 */
export async function seedRequestBoards(
  prisma: PrismaClient,
  boards: GameContent["requestBoards"],
  report: SeedReport,
): Promise<void> {
  for (const board of boards) {
    const boardFields = {
      name: board.name,
      description: board.description,
      active: board.active ?? true,
      dailyCompletionLimit: board.dailyCompletionLimit,
    };
    let dbBoard = await prisma.requestBoard.findUnique({
      where: { key: board.key },
    });
    if (!dbBoard) {
      dbBoard = await prisma.requestBoard.create({
        data: { key: board.key, ...boardFields },
      });
      report.record("Request boards", "created");
    } else if (sameFields(dbBoard, boardFields)) {
      report.record("Request boards", "unchanged");
    } else {
      dbBoard = await prisma.requestBoard.update({
        where: { key: board.key },
        data: boardFields,
      });
      report.record("Request boards", "updated");
    }

    const existing = await prisma.requestDefinition.findMany({
      where: { boardId: dbBoard.id },
      include: { requirements: true },
    });
    const authoredSlugs = new Set(board.requests.map((request) => request.slug));

    // Park rows whose position changes (or that are leaving) so the
    // (boardId, sequencePosition) unique constraint can't collide.
    let parkingSlot = -1;
    const parked = new Set<string>();
    for (const row of existing) {
      const authored = board.requests.find((request) => request.slug === row.slug);
      if (!authored || authored.sequencePosition !== row.sequencePosition) {
        await prisma.requestDefinition.update({
          where: { id: row.id },
          data: { sequencePosition: parkingSlot },
        });
        parked.add(row.id);
        parkingSlot -= 1;
      }
    }

    for (const request of board.requests) {
      const fields = {
        title: request.title,
        flavorText: request.flavorText ?? "",
        sequencePosition: request.sequencePosition,
        rewardCoins: request.rewardCoins,
        active: request.active ?? true,
      };
      const current = existing.find((row) => row.slug === request.slug);
      let definitionId: string;
      if (!current) {
        const created = await prisma.requestDefinition.create({
          data: { boardId: dbBoard.id, slug: request.slug, ...fields },
        });
        definitionId = created.id;
        report.record("Requests", "created");
      } else {
        definitionId = current.id;
        const unchanged = sameFields(current, fields);
        if (unchanged && !parked.has(current.id)) {
          report.record("Requests", "unchanged");
        } else {
          await prisma.requestDefinition.update({
            where: { id: current.id },
            data: fields,
          });
          report.record("Requests", unchanged ? "unchanged" : "updated");
        }
      }

      await syncRequirements(prisma, definitionId, request.requirements, report);
    }

    for (const row of existing) {
      if (!authoredSlugs.has(row.slug) && row.active) {
        await prisma.requestDefinition.update({
          where: { id: row.id },
          data: { active: false },
        });
        report.record("Requests", "deactivated");
      }
    }
  }
}

async function syncRequirements(
  prisma: PrismaClient,
  requestDefinitionId: string,
  authored: GameContent["requestBoards"][number]["requests"][number]["requirements"],
  report: SeedReport,
): Promise<void> {
  const items = await prisma.item.findMany({
    where: { slug: { in: authored.map((requirement) => requirement.itemSlug) } },
    select: { id: true, slug: true },
  });
  const itemBySlug = new Map(items.map((item) => [item.slug, item.id]));

  const existing = await prisma.requestRequirement.findMany({
    where: { requestDefinitionId },
  });
  const desiredItemIds = new Set<string>();

  for (const requirement of authored) {
    const itemId = itemBySlug.get(requirement.itemSlug);
    if (!itemId) {
      // Offline validation already rejects unknown slugs; this is a guard
      // against seeding a half-applied content edit.
      throw new Error(
        `Request requirement references unknown item "${requirement.itemSlug}"`,
      );
    }
    desiredItemIds.add(itemId);
    const current = existing.find((row) => row.itemId === itemId);
    if (!current) {
      await prisma.requestRequirement.create({
        data: { requestDefinitionId, itemId, quantity: requirement.quantity },
      });
      report.record("Request requirements", "created");
    } else if (current.quantity === requirement.quantity) {
      report.record("Request requirements", "unchanged");
    } else {
      await prisma.requestRequirement.update({
        where: { id: current.id },
        data: { quantity: requirement.quantity },
      });
      report.record("Request requirements", "updated");
    }
  }

  // Requirements are part of the definition, not history: a requirement
  // dropped from content is removed. Completed requests keep their own
  // snapshot of what was consumed.
  for (const row of existing) {
    if (!desiredItemIds.has(row.itemId)) {
      await prisma.requestRequirement.delete({ where: { id: row.id } });
      report.record("Request requirements", "deactivated");
    }
  }
}
