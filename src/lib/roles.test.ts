import { describe, expect, it } from "vitest";
import type { UserRole } from "@prisma/client";
import {
  ROLE_LABELS,
  ROLE_ORDER,
  canModerate,
  isAdmin,
  isAtLeast,
} from "./roles";

describe("role ranking", () => {
  it("ranks player below moderator below admin", () => {
    expect(isAtLeast("ADMIN", "MODERATOR")).toBe(true);
    expect(isAtLeast("MODERATOR", "PLAYER")).toBe(true);
    expect(isAtLeast("PLAYER", "MODERATOR")).toBe(false);
    expect(isAtLeast("MODERATOR", "ADMIN")).toBe(false);
  });

  it("treats every role as at least itself", () => {
    for (const role of ROLE_ORDER) {
      expect(isAtLeast(role, role)).toBe(true);
    }
  });

  /**
   * The asymmetry is the whole reason there are two privileged roles: an
   * administrator can do a moderator's job, and a moderator cannot touch
   * the economy. If this ever flips, moderation stops being safe to hand
   * to a trusted player.
   */
  it("lets an admin moderate but does not let a moderator administer", () => {
    expect(canModerate("ADMIN")).toBe(true);
    expect(isAdmin("MODERATOR")).toBe(false);
  });

  it("grants a plain player nothing", () => {
    expect(canModerate("PLAYER")).toBe(false);
    expect(isAdmin("PLAYER")).toBe(false);
  });

  /**
   * ROLE_ORDER is the documented ranking and RANK is what the code reads.
   * Two sources of truth that agree today can disagree after an edit, so
   * this pins them together: a role inserted in the middle of ROLE_ORDER
   * without updating RANK fails here.
   */
  it("keeps ROLE_ORDER consistent with the comparison it documents", () => {
    for (let i = 0; i < ROLE_ORDER.length; i++) {
      for (let j = 0; j < ROLE_ORDER.length; j++) {
        const higher = ROLE_ORDER[i] as UserRole;
        const lower = ROLE_ORDER[j] as UserRole;
        expect(isAtLeast(higher, lower)).toBe(i >= j);
      }
    }
  });

  it("names every role for the person holding it", () => {
    for (const role of ROLE_ORDER) {
      expect(ROLE_LABELS[role]).not.toBe("");
    }
  });
});
