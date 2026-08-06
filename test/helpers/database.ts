/**
 * Shared database handle for integration tests. Uses TEST_DATABASE_URL
 * (falling back to DATABASE_URL) with migrations applied.
 *
 * Locally, suites skip visibly when no database is configured. In CI this
 * is a HARD FAILURE: a misconfigured pipeline must never look green while
 * silently skipping the integration suites (docs/conventions.md).
 */
import { PrismaClient } from "@prisma/client";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

if (!databaseUrl && process.env.CI) {
  throw new Error(
    "CI requires TEST_DATABASE_URL (or DATABASE_URL) for integration tests — refusing to skip them silently.",
  );
}

export const testDb: PrismaClient | null = databaseUrl
  ? new PrismaClient({ datasourceUrl: databaseUrl })
  : null;

/** Unique per-suite fixture prefix so parallel test files never collide. */
export function fixturePrefix(suite: string): string {
  return `t_${suite}_${Math.random().toString(36).slice(2, 8)}`;
}
