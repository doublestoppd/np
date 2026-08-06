/**
 * Startup configuration validation (docs/operations.md). In production,
 * missing or known-development secret values are a hard startup failure —
 * never a silent fallback. Called from instrumentation.ts.
 */

const DEV_FALLBACKS = new Set([
  "dev-only-restock-seed",
  "dev-local-restock-seed",
  "dev-local-cron-secret",
  "dev-local-daily-seed",
  "change-me",
]);

interface ConfigIssue {
  variable: string;
  problem: string;
}

export function validateServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const isProduction = env.NODE_ENV === "production";

  const require = (variable: string, { secret = false } = {}) => {
    const value = env[variable];
    if (!value) {
      issues.push({ variable, problem: "missing" });
    } else if (secret && DEV_FALLBACKS.has(value)) {
      issues.push({ variable, problem: "development fallback value" });
    }
  };

  require("DATABASE_URL");
  if (isProduction) {
    require("RESTOCK_SEED_SECRET", { secret: true });
    require("DAILY_SEED_SECRET", { secret: true });
    require("CRON_SECRET", { secret: true });
    require("APP_URL");
    if (env.TRUSTED_PROXY !== "true" && env.TRUSTED_PROXY !== "false") {
      issues.push({
        variable: "TRUSTED_PROXY",
        problem: "must be explicitly 'true' or 'false' in production",
      });
    }
  }
  return issues;
}

/** Throws (crashing startup) when production configuration is invalid. */
export function assertValidServerConfig(): void {
  const issues = validateServerConfig();
  if (issues.length === 0) {
    return;
  }
  const summary = issues
    .map((issue) => `${issue.variable}: ${issue.problem}`)
    .join("; ");
  if (process.env.NODE_ENV === "production") {
    // Never echo secret values — variable names only.
    throw new Error(`Invalid production configuration — ${summary}`);
  }
  console.warn(`[config] non-production configuration warnings: ${summary}`);
}
