import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Centralized request-origin resolution (docs/conventions.md).
 *
 * Forwarding headers are only honored when TRUSTED_PROXY=true — i.e. the
 * deployment guarantees every request traverses a proxy that *overwrites*
 * them. Otherwise they are attacker-controlled, and we fail closed by
 * reporting no origin at all.
 *
 * "No origin" means exactly that: callers must not fold every anonymous
 * request into one shared bucket, because a shared bucket is a lockout
 * lever — one abuser exhausts it and every other player is refused (see
 * `src/server/actions/auth.ts`). Callers skip origin-scoped limits when the
 * origin is unknown and rely on their identity-scoped limits instead.
 *
 * Which header wins matters. A proxy that *appends*
 * (`$proxy_add_x_forwarded_for`) leaves the client's own value first in the
 * list, so trusting `x-forwarded-for[0]` would trust the attacker. We read
 * `x-real-ip` first (nginx sets it from `$remote_addr`, which no client can
 * forge) and otherwise take the *last* hop of `x-forwarded-for` — the entry
 * the nearest trusted proxy added. This assumes a single trusted hop, which
 * is the topology the bundled nginx config creates (demo-hosting.md).
 *
 * Full IPs are never stored — only truncated hashes.
 */

export function isTrustedProxyConfigured(): boolean {
  return process.env.TRUSTED_PROXY === "true";
}

/** Longest possible textual IPv6 address, incl. an IPv4-mapped tail. */
const MAX_ADDRESS_LENGTH = 45;

/** The client address, or null when no trustworthy signal is available. */
export async function resolveClientOrigin(): Promise<string | null> {
  if (!isTrustedProxyConfigured()) {
    return null;
  }
  const headerStore = await headers();

  const realIp = headerStore.get("x-real-ip")?.trim();
  if (realIp && realIp.length <= MAX_ADDRESS_LENGTH) {
    return realIp;
  }

  const forwarded = headerStore.get("x-forwarded-for");
  if (!forwarded) {
    return null;
  }
  // Last hop, not first: the nearest trusted proxy appends its peer, and
  // everything before it came from the client.
  const hops = forwarded.split(",");
  const client = hops[hops.length - 1]?.trim();
  return client && client.length <= MAX_ADDRESS_LENGTH ? client : null;
}

/** Privacy-minimizing stable identifier for an origin (never the raw IP). */
export function hashOrigin(origin: string): string {
  return createHash("sha256").update(origin).digest("hex").slice(0, 16);
}

/**
 * Convenience: hashed origin for rate-limit keys and audit metadata, or
 * null when the origin is unknown. Never substitute a constant for null.
 */
export async function clientOriginHash(): Promise<string | null> {
  const origin = await resolveClientOrigin();
  return origin === null ? null : hashOrigin(origin);
}
