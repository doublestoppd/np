/**
 * Read-only reconciliation report (docs/operations.md):
 *   npx tsx scripts/reconcile.ts [username ...]
 * With usernames, checks are scoped to those accounts (plus global stock
 * checks). Exit code 1 when findings exist. Never modifies data.
 */
import { PrismaClient } from "@prisma/client";
import { runReconciliation } from "../src/server/modules/admin/reconciliation";

const db = new PrismaClient();

async function main(): Promise<void> {
  const usernames = process.argv.slice(2);
  let userIds: string[] | undefined;
  if (usernames.length > 0) {
    const users = await db.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true },
    });
    userIds = users.map((user) => user.id);
  }
  const findings = await runReconciliation(db, { userIds });
  if (findings.length === 0) {
    console.log("reconciliation: no findings");
    return;
  }
  for (const finding of findings) {
    console.log(`[${finding.check}] ${finding.subject}: ${finding.detail}`);
  }
  console.log(`reconciliation: ${findings.length} finding(s)`);
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
