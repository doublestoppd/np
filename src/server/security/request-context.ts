import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Centralized request-origin resolution (docs/conventions.md).
 *
 * X-Forwarded-For is only honored when TRUSTED_PROXY=true (i.e. the
 * deployment guarantees requests traverse a proxy that overwrites the
 * header). Otherwise the value is attacker-controlled and we fail closed to
 * "unknown", which rate-limiters treat as a single shared bucket. Full IPs
 * are never stored — only truncated hashes.
 */

export function isTrustedProxyConfigured(): boolean {
  return process.env.TRUSTED_PROXY === "true";
}

export async function resolveClientOrigin(): Promise<string> {
  if (!isTrustedProxyConfigured()) {
    return "unknown";
  }
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (!forwarded) {
    return "unknown";
  }
  // First hop is the client when the trusted proxy appends.
  const client = forwarded.split(",")[0]?.trim();
  return client && client.length <= 45 ? client : "unknown";
}

/** Privacy-minimizing stable identifier for an origin (never the raw IP). */
export function hashOrigin(origin: string): string {
  return createHash("sha256").update(origin).digest("hex").slice(0, 16);
}

/** Convenience: hashed origin for rate-limit keys and audit metadata. */
export async function clientOriginHash(): Promise<string> {
  return hashOrigin(await resolveClientOrigin());
}
