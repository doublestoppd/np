/**
 * Boundary tests for the roll action: what a *request* can and cannot make
 * happen, independent of the domain rules.
 *
 * The session module is mocked so the unauthenticated path is exercised
 * for real rather than inferred, and so these run without a request scope.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const rollRandomEvent = vi.fn();

vi.mock("@/server/auth/session", () => ({ getCurrentUser }));
vi.mock("@/server/modules/events/roll", () => ({ rollRandomEvent }));
vi.mock("@/server/db", () => ({ prisma: {} }));

const { rollRandomEventAction } = await import("./events");

const KEY = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  getCurrentUser.mockReset();
  rollRandomEvent.mockReset();
  rollRandomEvent.mockResolvedValue({ outcome: "none", reason: "missed" });
});

describe("rollRandomEventAction", () => {
  it("does nothing at all for an unauthenticated caller", async () => {
    getCurrentUser.mockResolvedValue(null);

    const result = await rollRandomEventAction({
      routePath: "/inventory",
      idempotencyKey: KEY,
    });

    expect(result).toEqual({ event: null });
    // Never reaches the domain: no pacing consumed, no rate-limit row, no
    // database work at all on behalf of a request with no session.
    expect(rollRandomEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed input before touching the domain", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });

    for (const input of [
      { routePath: "", idempotencyKey: KEY },
      { routePath: "/inventory", idempotencyKey: "short" },
      { routePath: "x".repeat(600), idempotencyKey: KEY },
    ]) {
      expect(await rollRandomEventAction(input)).toEqual({ event: null });
    }
    expect(rollRandomEvent).not.toHaveBeenCalled();
  });

  it("passes the reported route through for the server to judge", async () => {
    // The action must not pre-filter routes: eligibility is one decision,
    // made in one place, so the two cannot drift apart.
    getCurrentUser.mockResolvedValue({ id: "u1" });

    await rollRandomEventAction({
      routePath: "/_next/static/chunk.js",
      idempotencyKey: KEY,
    });

    expect(rollRandomEvent).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: "u1", routePath: "/_next/static/chunk.js" }),
    );
  });

  it("reports nothing when the domain declines to produce an event", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    for (const reason of ["duplicate", "cooldown", "missed", "ineligible-route"]) {
      rollRandomEvent.mockResolvedValue({ outcome: "none", reason });
      expect(
        await rollRandomEventAction({ routePath: "/inventory", idempotencyKey: KEY }),
      ).toEqual({ event: null });
    }
  });

  it("returns a fully resolved presentation payload for an event", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    rollRandomEvent.mockResolvedValue({
      outcome: "event",
      occurrenceId: "occ_1",
      payload: {
        eventKey: "loose-change-in-the-moss",
        title: "Loose change",
        message: "Something glints.",
        category: "discovery",
        rarity: "common",
        effects: [{ kind: "coins", amount: "6" }],
        rewardSummary: "6 coins",
      },
    });

    const result = await rollRandomEventAction({
      routePath: "/inventory",
      idempotencyKey: KEY,
    });

    // Everything the modal needs, already resolved — the client renders
    // this and applies nothing.
    expect(result.event).toEqual({
      occurrenceId: "occ_1",
      title: "Loose change",
      message: "Something glints.",
      category: "discovery",
      rarity: "common",
      rewardSummary: "6 coins",
      effects: [{ kind: "coins", amount: "6" }],
    });
  });

  it("swallows a domain failure rather than surfacing it on the page", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    rollRandomEvent.mockRejectedValue(new Error("database on fire"));

    // A random event is a garnish on a page the player already has. It
    // must never be the reason a page view looks broken.
    await expect(
      rollRandomEventAction({ routePath: "/inventory", idempotencyKey: KEY }),
    ).resolves.toEqual({ event: null });
  });
});
