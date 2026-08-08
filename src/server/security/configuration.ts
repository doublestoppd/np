/**
 * Startup configuration validation (docs/operations.md). In production,
 * missing or known-development secret values are a hard startup failure —
 * never a silent fallback. Called from instrumentation.ts.
 */

const DEV_FALLBACKS = new Set([
  "dev-only-restock-seed",
  "dev-local-restock-seed",
  "dev-local-cron-secret",
  "dev-only-daily-rotation",
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
    require("CRON_SECRET", { secret: true });
    // Keys the per-band word rotation. A known value here means every
    // band's answers are computable, which is the farm this closed.
    require("DAILY_ROTATION_SECRET", { secret: true });
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
    /**
     * Printed line by line BEFORE throwing.
     *
     * The throw alone was nearly useless in practice: Next.js wraps it as
     * "An error occurred while loading instrumentation hook: <message>",
     * the whole thing lands on one journalctl line, and the part naming
     * the variable is past the right edge of a phone screen. An operator
     * watching a droplet crash-loop could see that configuration was
     * invalid and not which variable — while the log filled with the same
     * truncated line every two seconds.
     *
     * Never echo values, only names: these are secrets.
     */
    console.error("[config] cannot start — production configuration is invalid:");
    for (const issue of issues) {
      console.error(`[config]   ${issue.variable}: ${issue.problem}`);
    }
    console.error("[config] see docs/operations.md — Environment variables");
    throw new Error(`Invalid production configuration — ${summary}`);
  }
  console.warn(`[config] non-production configuration warnings: ${summary}`);
}
