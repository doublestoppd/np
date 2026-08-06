/**
 * Unit tests for request-origin resolution. These encode the trust rules
 * that the auth rate limiters depend on: a spoofable header must never
 * become a rate-limit subject, and an unresolvable origin must be reported
 * as *absent* rather than as a shared constant.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const headerValues = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerValues.get(name.toLowerCase()) ?? null,
  }),
}));

const { clientOriginHash, hashOrigin, resolveClientOrigin } = await import(
  "./request-context"
);

function setHeaders(values: Record<string, string>): void {
  headerValues.clear();
  for (const [name, value] of Object.entries(values)) {
    headerValues.set(name.toLowerCase(), value);
  }
}

afterEach(() => {
  headerValues.clear();
  delete process.env.TRUSTED_PROXY;
});

describe("resolveClientOrigin", () => {
  it("reports no origin when no proxy is trusted, however loud the headers", async () => {
    process.env.TRUSTED_PROXY = "false";
    setHeaders({
      "x-forwarded-for": "203.0.113.7",
      "x-real-ip": "203.0.113.7",
    });
    expect(await resolveClientOrigin()).toBeNull();
    expect(await clientOriginHash()).toBeNull();
  });

  it("prefers x-real-ip, which the proxy overwrites and clients cannot forge", async () => {
    process.env.TRUSTED_PROXY = "true";
    setHeaders({
      "x-real-ip": "198.51.100.4",
      "x-forwarded-for": "1.1.1.1, 198.51.100.4",
    });
    expect(await resolveClientOrigin()).toBe("198.51.100.4");
  });

  it("takes the LAST forwarded hop, so a spoofed prefix cannot pick the bucket", async () => {
    process.env.TRUSTED_PROXY = "true";
    // What an appending proxy produces when the client sent its own value.
    setHeaders({ "x-forwarded-for": "10.0.0.9, 198.51.100.4" });
    expect(await resolveClientOrigin()).toBe("198.51.100.4");
  });

  it("reports no origin when a trusted proxy sent nothing usable", async () => {
    process.env.TRUSTED_PROXY = "true";
    setHeaders({});
    expect(await resolveClientOrigin()).toBeNull();

    setHeaders({ "x-forwarded-for": "x".repeat(46) });
    expect(await resolveClientOrigin()).toBeNull();
  });

  it("never exposes the address itself", async () => {
    const hashed = hashOrigin("198.51.100.4");
    expect(hashed).toHaveLength(16);
    expect(hashed).not.toContain("198");
    expect(hashOrigin("198.51.100.4")).toBe(hashed);
    expect(hashOrigin("198.51.100.5")).not.toBe(hashed);
  });
});
