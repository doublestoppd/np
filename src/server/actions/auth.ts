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
 * (docs/conventions.md); responses avoid username enumeration.
 *
 * Rate limiting is layered, and the layers are deliberately scoped:
 *
 * - **Per identity** — always applied. Bounds attempts against one account
 *   (sign-in) or one requested name (sign-up) without touching anyone else.
 * - **Per origin** — applied *only* when the origin is trustworthy
 *   (TRUSTED_PROXY=true and a proxy-set address, see
 *   `security/request-context.ts`). Without that signal every anonymous
 *   request would share one bucket, so a single abuser could exhaust it and
 *   lock the whole game out of signing in or registering. Skipping the
 *   layer is strictly better than aiming it at everybody.
 * - **Global sign-up backstop** — the one intentionally shared bucket, and
 *   only for account creation, where no per-player dimension exists before
 *   the account does. Its ceiling is set high enough that ordinary play
 *   never reaches it and low enough to bound scripted mass-registration;
 *   tripping it is an operator signal (docs/operations.md), not a normal
 *   condition. Operators can retune it with SIGNUP_BURST_LIMIT.
 */

const SIGN_IN_IDENTITY_RULE = {
  name: "auth:sign-in:identity",
  limit: 10,
  windowSeconds: 300,
};
const SIGN_IN_ORIGIN_RULE = {
  name: "auth:sign-in:origin",
  limit: 20,
  windowSeconds: 300,
};
const SIGN_UP_IDENTITY_RULE = {
  name: "auth:sign-up:identity",
  limit: 5,
  windowSeconds: 300,
};
const SIGN_UP_ORIGIN_RULE = {
  name: "auth:sign-up:origin",
  limit: 5,
  windowSeconds: 300,
};

const DEFAULT_SIGNUP_BURST_LIMIT = 60;

/** Shared ceiling on account creation, per 5 minutes, across everyone. */
function signUpBurstRule() {
  const configured = Number(process.env.SIGNUP_BURST_LIMIT);
  return {
    name: "auth:sign-up:global",
    limit:
      Number.isInteger(configured) && configured > 0
        ? configured
        : DEFAULT_SIGNUP_BURST_LIMIT,
    windowSeconds: 300,
  };
}

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
    await enforceRateLimit(prisma, SIGN_UP_IDENTITY_RULE, normalized);
    const origin = await clientOriginHash();
    if (origin !== null) {
      await enforceRateLimit(prisma, SIGN_UP_ORIGIN_RULE, origin);
    }
    await enforceRateLimit(prisma, signUpBurstRule(), "all");
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
    await enforceRateLimit(prisma, SIGN_IN_IDENTITY_RULE, normalized);
    const origin = await clientOriginHash();
    if (origin !== null) {
      await enforceRateLimit(prisma, SIGN_IN_ORIGIN_RULE, origin);
    }
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
