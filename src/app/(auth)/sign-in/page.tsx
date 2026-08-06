import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/server/actions/auth";
import { getCurrentUser } from "@/server/auth/session";
import { FeedbackBanner, firstParam } from "@/components/feedback-banner";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getCurrentUser()) {
    redirect("/");
  }
  const params = await searchParams;

  return (
    <section aria-labelledby="sign-in-heading">
      <h2 id="sign-in-heading" className="text-lg font-semibold">
        Sign in
      </h2>
      <FeedbackBanner error={firstParam(params.error)} />
      <form action={signIn} className="mt-4 flex flex-col gap-4">
        <div>
          <label
            htmlFor="username"
            className="block text-sm font-medium text-stone-700"
          >
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base focus:outline-2 focus:outline-offset-1 focus:outline-emerald-700"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-stone-700"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base focus:outline-2 focus:outline-offset-1 focus:outline-emerald-700"
          />
        </div>
        <button
          type="submit"
          className="mt-2 min-h-11 rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          Sign in
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-600">
        New to the grove?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-emerald-800 underline underline-offset-2"
        >
          Create an account
        </Link>
      </p>
    </section>
  );
}
