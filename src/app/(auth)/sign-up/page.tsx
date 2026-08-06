import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signUp } from "@/server/actions/auth";
import { getCurrentUser } from "@/server/auth/session";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (await getCurrentUser()) {
    redirect("/");
  }
  const params = await searchParams;

  return (
    <Surface as="section" raised aria-labelledby="sign-up-heading">
      <h1 id="sign-up-heading" className="font-display text-lg font-semibold">
        Create account
      </h1>
      <div className="mt-3">
        <FeedbackBanner error={firstParam(params.error)} />
      </div>
      <form action={signUp} className="flex flex-col gap-4">
        <FormField
          label="Username"
          htmlFor="username"
          help="3–20 characters: letters, numbers, underscores."
        >
          <Input
            id="username"
            name="username"
            type="text"
            required
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9_]+"
            title="Letters, numbers, and underscores only."
            autoComplete="username"
            aria-describedby="username-help"
          />
        </FormField>
        <FormField
          label="Password"
          htmlFor="password"
          help="At least 8 characters."
        >
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            aria-describedby="password-help"
          />
        </FormField>
        <SubmitButton pendingLabel="Creating account…" className="mt-2">
          Create account
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-text-muted">
        Already have an account?{" "}
        <TextLink href="/sign-in" className="font-medium">
          Sign in
        </TextLink>
      </p>
    </Surface>
  );
}
