"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  createSession,
  destroyAllSessions,
  destroySession,
  requireUser,
} from "@/server/auth/session";
import { normalizeUsername } from "@/server/modules/accounts/identity";
import { enforceRateLimit, RateLimitedError } from "@/server/security/rate-limit";
import { clientOriginHash } from "@/server/security/request-context";
import { credentialsSchema } from "@/lib/validation";

/**
 * Authentication actions. Identity is the normalized username
 * (docs/conventions.md); responses avoid username enumeration; sign-in and
 * sign-up are rate-limited per identity and per hashed origin.
 */

const SIGN_IN_RULE = { name: "auth:sign-in", limit: 10, windowSeconds: 300 };
const SIGN_UP_RULE = { name: "auth:sign-up", limit: 5, windowSeconds: 300 };
const RATE_MESSAGE = "Too many attempts. Wait a moment and try again.";

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

export async function signUp(formData: FormData): Promise<void> {
  const parsed = credentialsSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect(`/sign-up?error=${encodeURIComponent(firstIssue(parsed.error))}`);
  }

  const { username, password } = parsed.data;
  const normalized = normalizeUsername(username);
  try {
    await enforceRateLimit(prisma, SIGN_UP_RULE, await clientOriginHash());
  } catch (error) {
    if (error instanceof RateLimitedError) {
      redirect(`/sign-up?error=${encodeURIComponent(RATE_MESSAGE)}`);
    }
    throw error;
  }

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: {
        username,
        normalizedUsername: normalized,
        passwordHash: await hashPassword(password),
      },
    });
    userId = user.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirect(
        `/sign-up?error=${encodeURIComponent("That username is taken.")}`,
      );
    }
    throw error;
  }

  await createSession(userId);
  redirect("/starter");
}

export async function signIn(formData: FormData): Promise<void> {
  const parsed = credentialsSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  const failure = `/sign-in?error=${encodeURIComponent(
    "Incorrect username or password.",
  )}`;
  if (!parsed.success) {
    redirect(failure);
  }

  const normalized = normalizeUsername(parsed.data.username);
  try {
    await enforceRateLimit(prisma, SIGN_IN_RULE, normalized);
    await enforceRateLimit(prisma, SIGN_IN_RULE, await clientOriginHash());
  } catch (error) {
    if (error instanceof RateLimitedError) {
      redirect(`/sign-in?error=${encodeURIComponent(RATE_MESSAGE)}`);
    }
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { normalizedUsername: normalized },
  });
  if (
    !user ||
    user.deactivatedAt !== null ||
    !(await verifyPassword(parsed.data.password, user.passwordHash))
  ) {
    // One message for every failure mode — no enumeration.
    redirect(failure);
  }

  // Session rotation: every successful sign-in issues a fresh token.
  await createSession(user.id);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/sign-in");
}

/** Signs the user out of every device/session. */
export async function signOutEverywhere(): Promise<void> {
  const user = await requireUser();
  await destroyAllSessions(user.id);
  redirect("/sign-in");
}
