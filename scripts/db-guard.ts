import "dotenv/config";

/**
 * Destructive-command guard: reset commands only ever run against a
 * database that is explicitly disposable. Production is always refused;
 * non-local databases additionally require DATABASE_DISPOSABLE=true.
 */
export function assertDatabaseIsDisposable(): string {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "Refusing to reset: NODE_ENV is production. Reset commands only run against disposable development databases.",
    );
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Refusing to reset: DATABASE_URL is not set.");
    process.exit(1);
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error("Refusing to reset: DATABASE_URL is not a valid URL.");
    process.exit(1);
  }
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!isLocal && process.env.DATABASE_DISPOSABLE !== "true") {
    console.error(
      `Refusing to reset: database host "${host}" is not local. If this database really is disposable, set DATABASE_DISPOSABLE=true and re-run.`,
    );
    process.exit(1);
  }
  return url;
}
