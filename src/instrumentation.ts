import { assertValidServerConfig } from "@/server/security/configuration";

/**
 * Next.js instrumentation hook: runs once at server startup. Production
 * with missing/development-fallback secrets fails here, before serving any
 * traffic (docs/operations.md).
 */
export function register(): void {
  assertValidServerConfig();
}
