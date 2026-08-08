import type { PrismaClient } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/**
 * Forum boards: UPSERT the authored boards, and DEACTIVATE (never delete)
 * any that leave the content file.
 *
 * Deletion is not an option and never will be: threads and posts point at
 * a board with `onDelete: Restrict`, and what people wrote is not
 * disposable because an author changed their mind about a board. A
 * removed board goes inactive, which hides it from the index and refuses
 * new threads while leaving every existing conversation readable by
 * anyone holding a link.
 *
 * Positions are not uniquely constrained (two boards may sort together
 * and the tie breaks on slug), so there is no parking dance here — unlike
 * request definitions, whose sequence positions must be unique per board.
 */
export async function seedForumBoards(
  prisma: PrismaClient,
  boards: GameContent["forumBoards"],
  report: SeedReport,
): Promise<void> {
  const authored = new Set(boards.map((board) => board.slug));

  for (const board of boards) {
    const fields = {
      name: board.name,
      description: board.description,
      position: board.position,
      staffOnly: board.staffOnly ?? false,
      active: board.active ?? true,
    };
    const existing = await prisma.forumBoard.findUnique({
      where: { slug: board.slug },
    });
    if (!existing) {
      await prisma.forumBoard.create({ data: { slug: board.slug, ...fields } });
      report.record("Forum boards", "created");
    } else if (sameFields(existing, fields)) {
      report.record("Forum boards", "unchanged");
    } else {
      await prisma.forumBoard.update({
        where: { slug: board.slug },
        data: fields,
      });
      report.record("Forum boards", "updated");
    }
  }

  const orphans = await prisma.forumBoard.findMany({
    where: { active: true, slug: { notIn: [...authored] } },
    select: { id: true },
  });
  for (const orphan of orphans) {
    await prisma.forumBoard.update({
      where: { id: orphan.id },
      data: { active: false },
    });
    report.record("Forum boards", "deactivated");
  }
}
