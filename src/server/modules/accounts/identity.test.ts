/**
 * Canonical identity: normalization rules and the database uniqueness that
 * backs sign-in, profile lookup, and shop slugs (docs/conventions.md).
 */
import { afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { normalizeUsername } from "./identity";
import { getPublicProfile } from "@/server/modules/profiles/profile";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

describe("normalizeUsername (unit)", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  Glim_Player9 ")).toBe("glim_player9");
  });

  it("maps case variants to the same identity", () => {
    const variants = ["MossKeeper", "mosskeeper", "MOSSKEEPER", "mossKeeper"];
    const normalized = new Set(variants.map(normalizeUsername));
    expect(normalized.size).toBe(1);
  });

  it("applies NFKC before lowercasing (future-proofing beyond ASCII)", () => {
    // Fullwidth forms compatibility-normalize to ASCII.
    expect(normalizeUsername("Ｇｌｉｍ")).toBe("glim");
  });

  it("is idempotent", () => {
    const once = normalizeUsername("  MixedCase ");
    expect(normalizeUsername(once)).toBe(once);
  });
});

const prefix = fixturePrefix("idn");

describe.skipIf(!testDb)("normalized identity (integration)", () => {
  const db = testDb as PrismaClient;

  afterAll(async () => {
    await cleanupTestUsers(db, prefix);
    // The case-variant fixture starts with an uppercased prefix.
    await cleanupTestUsers(db, prefix.toUpperCase());
    await db.$disconnect();
  });

  it("profile lookup finds a user under any casing of their name", async () => {
    const user = await createTestUser(db, { username: `${prefix}_MixedCase` });
    for (const query of [
      `${prefix}_MixedCase`,
      `${prefix}_mixedcase`,
      `${prefix}_MIXEDCASE`.toUpperCase(),
    ]) {
      const profile = await getPublicProfile(db, query);
      expect(profile?.username).toBe(user.username);
    }
  });

  it("rejects registration of a case-variant of an existing name", async () => {
    await createTestUser(db, { username: `${prefix}_taken` });
    const error = await createTestUser(db, {
      username: `${prefix}_taken`.toUpperCase(),
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
  });
});
