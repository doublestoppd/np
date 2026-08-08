/**
 * The alpha bootstrap administrator: it promotes exactly one name, does so
 * once, and leaves a trail.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  bootstrapAdminUsernames,
  ensureBootstrapAdmin,
  isBootstrapAdminUsername,
} from "./bootstrap-admin";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

const prefix = fixturePrefix("bootstrap");

describe("bootstrap admin configuration (pure)", () => {
  const original = process.env.ADMIN_BOOTSTRAP_USERNAMES;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_BOOTSTRAP_USERNAMES;
    else process.env.ADMIN_BOOTSTRAP_USERNAMES = original;
  });

  it("ships with the author's name and matches it case-insensitively", () => {
    delete process.env.ADMIN_BOOTSTRAP_USERNAMES;
    expect(bootstrapAdminUsernames()).toContain("jbrodye");
    expect(isBootstrapAdminUsername("jbrodye")).toBe(true);
    expect(isBootstrapAdminUsername("JBrodye")).toBe(true);
    expect(isBootstrapAdminUsername("  JBRODYE  ")).toBe(true);
    expect(isBootstrapAdminUsername("jbrodye2")).toBe(false);
    expect(isBootstrapAdminUsername("brodye")).toBe(false);
  });

  it("can be overridden, and can be switched off entirely", () => {
    process.env.ADMIN_BOOTSTRAP_USERNAMES = "someoneelse, another";
    expect(isBootstrapAdminUsername("jbrodye")).toBe(false);
    expect(isBootstrapAdminUsername("someoneelse")).toBe(true);
    expect(isBootstrapAdminUsername("another")).toBe(true);

    // The escape hatch a deployment that is not the author's needs.
    process.env.ADMIN_BOOTSTRAP_USERNAMES = "";
    expect(bootstrapAdminUsernames()).toEqual([]);
    expect(isBootstrapAdminUsername("jbrodye")).toBe(false);
  });
});

describe.skipIf(!testDb)("bootstrap admin promotion (integration)", () => {
  const db = testDb as PrismaClient;
  const original = process.env.ADMIN_BOOTSTRAP_USERNAMES;

  beforeEach(async () => {
    // A fixture name rather than the real one, so the test never depends
    // on — or creates — an account called jbrodye in a shared database.
    process.env.ADMIN_BOOTSTRAP_USERNAMES = `${prefix}_boot`;
    await db.securityEvent.deleteMany({
      where: { message: { contains: prefix } },
    });
    await cleanupTestUsers(db, prefix);
  });

  afterAll(async () => {
    if (original === undefined) delete process.env.ADMIN_BOOTSTRAP_USERNAMES;
    else process.env.ADMIN_BOOTSTRAP_USERNAMES = original;
    await db.securityEvent.deleteMany({
      where: { message: { contains: prefix } },
    });
    await cleanupTestUsers(db, prefix);
    await db.$disconnect();
  });

  it("promotes the bootstrap account and records why", async () => {
    const user = await createTestUser(db, { username: `${prefix}_boot` });
    expect(user.isAdmin).toBe(false);

    expect(await ensureBootstrapAdmin(db, `${prefix}_boot`)).toBe(true);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.isAdmin).toBe(true);

    // Loud, not silent: an administrator appearing is findable afterwards.
    const events = await db.securityEvent.findMany({
      where: { userId: user.id, type: "admin-action" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.severity).toBe("warning");
    expect(events[0]?.message).toContain("Bootstrap admin promoted");
  });

  it("is a no-op on every subsequent call", async () => {
    await createTestUser(db, { username: `${prefix}_boot` });
    expect(await ensureBootstrapAdmin(db, `${prefix}_boot`)).toBe(true);
    expect(await ensureBootstrapAdmin(db, `${prefix}_boot`)).toBe(false);
    expect(await ensureBootstrapAdmin(db, `${prefix}_boot`)).toBe(false);
    // One promotion, one audit row — not one per sign-in.
    expect(
      await db.securityEvent.count({
        where: { message: { contains: `${prefix}_boot` } },
      }),
    ).toBe(1);
  });

  it("promotes nobody else, whatever they are called", async () => {
    const other = await createTestUser(db, {
      username: `${prefix}_ordinary_${randomUUID().slice(0, 6)}`,
    });
    expect(await ensureBootstrapAdmin(db, other.username)).toBe(false);
    const after = await db.user.findUniqueOrThrow({ where: { id: other.id } });
    expect(after.isAdmin).toBe(false);
  });

  it("matches the stored account case-insensitively", async () => {
    const user = await createTestUser(db, { username: `${prefix}_BOOT` });
    // Signed up as "..._BOOT", signing in as "..._boot" — the normalised
    // identity is what decides, the same rule sign-in itself follows.
    expect(await ensureBootstrapAdmin(db, `${prefix}_boot`)).toBe(true);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.isAdmin).toBe(true);
  });

  it("does nothing at all when the bootstrap is switched off", async () => {
    process.env.ADMIN_BOOTSTRAP_USERNAMES = "";
    const user = await createTestUser(db, { username: `${prefix}_boot` });
    expect(await ensureBootstrapAdmin(db, `${prefix}_boot`)).toBe(false);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.isAdmin).toBe(false);
  });
});
