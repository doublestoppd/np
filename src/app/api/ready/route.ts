import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { validateServerConfig } from "@/server/security/configuration";

/**
 * Readiness: configuration is valid and the database answers. Returns only
 * pass/fail per subsystem — never variable values or errors with secrets.
 */
export async function GET(): Promise<NextResponse> {
  const configIssues = validateServerConfig();
  let databaseOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    databaseOk = false;
  }
  const ready = configIssues.length === 0 && databaseOk;
  return NextResponse.json(
    {
      status: ready ? "ready" : "not-ready",
      checks: {
        configuration: configIssues.length === 0 ? "ok" : "invalid",
        database: databaseOk ? "ok" : "unreachable",
      },
    },
    { status: ready ? 200 : 503 },
  );
}
