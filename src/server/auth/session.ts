import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma, type DbClient } from "@/server/db";

export const SESSION_COOKIE = "vp_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a session row and sets the cookie. Only the SHA-256 hash of the
 * token is stored, so a leaked database dump cannot be replayed as cookies.
 * Must be called from a server action or route handler.
 *
 * This is a true rotation: the token this device was carrying is deleted,
 * not merely replaced in the cookie jar. Overwriting the cookie alone left
 * the previous row valid for the rest of its 30 days, so a token captured
 * before sign-in stayed usable afterwards — signing in again is the natural
 * thing to do when you suspect something is wrong, and it has to actually
 * mean something. Only this device's row is touched; other devices keep
 * their sessions (that is what "sign out everywhere" is for).
 */
export async function createSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const previousToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (previousToken) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashToken(previousToken) },
    });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Signs out everywhere: deletes every session for the user. */
export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** Deletes the current session row and clears the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Returns the signed-in user or null. Cached per request so layouts and pages
 * can each call it without duplicate queries.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    return null;
  }
  if (session.user.deactivatedAt !== null) {
    return null;
  }
  return session.user;
});

/**
 * Retention cleanup for expired sessions, run from the scheduler alongside
 * the other retention sweeps (docs/operations.md).
 *
 * Expiry is already enforced on every read, so this is not an authorization
 * control — it is data hygiene. Without it the table only ever grew, and it
 * held one row per sign-in per device forever: a live inventory of who used
 * the game and when, kept indefinitely for no operational reason.
 */
export async function cleanupSessions(
  db: DbClient,
  now: Date = new Date(),
): Promise<number> {
  const result = await db.session.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return result.count;
}

/** Returns the signed-in user or redirects to the sign-in page. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return user;
}
