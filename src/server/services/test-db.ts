/**
 * Shared handle for integration tests. Uses TEST_DATABASE_URL (falling back
 * to DATABASE_URL) with migrations applied; suites skip visibly when neither
 * is configured. See README.md "Testing".
 */
import { PrismaClient } from "@prisma/client";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

export const testDb: PrismaClient | null = databaseUrl
  ? new PrismaClient({ datasourceUrl: databaseUrl })
  : null;

/** Unique per-suite fixture prefix so parallel test files never collide. */
export function fixturePrefix(suite: string): string {
  return `t_${suite}_${Math.random().toString(36).slice(2, 8)}`;
}
