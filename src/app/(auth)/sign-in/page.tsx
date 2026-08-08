import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signIn } from "@/server/actions/auth";
import { getCurrentUser } from "@/server/auth/session";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (await getCurrentUser()) {
    redirect("/");
  }
  const params = await searchParams;

  return (
    <Surface as="section" raised aria-labelledby="sign-in-heading">
      <h1 id="sign-in-heading" className="font-display text-lg font-semibold">
        Sign in
      </h1>
      <div className="mt-3">
        <FeedbackBanner error={firstParam(params.error)} />
      </div>
      <form action={signIn} className="flex flex-col gap-4">
        <FormField label="Username" htmlFor="username">
          <Input
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
          />
        </FormField>
        <FormField label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </FormField>
        <SubmitButton pendingLabel="Signing in…" className="mt-2">
          Sign in
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-text-muted">
        New here?{" "}
        <TextLink href="/sign-up" className="font-medium">
          Create an account
        </TextLink>
      </p>
    </Surface>
  );
}
