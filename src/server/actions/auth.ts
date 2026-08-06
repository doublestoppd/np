"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, destroySession } from "@/server/auth/session";
import { credentialsSchema } from "@/lib/validation";

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
  let userId: string;
  try {
    const user = await prisma.user.create({
      data: { username, passwordHash: await hashPassword(password) },
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

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    redirect(failure);
  }

  await createSession(user.id);
  redirect("/");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/sign-in");
}
