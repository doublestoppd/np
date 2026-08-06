import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { chooseStarterAction } from "@/server/actions/pets";
import { PetArt } from "@/components/pet/pet-art";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Choose your companion" };

export default async function StarterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const hasPet = await prisma.pet.count({ where: { ownerId: user.id } });
  if (hasPet > 0) {
    redirect("/");
  }

  const [species, params] = await Promise.all([
    prisma.petSpecies.findMany({ orderBy: { name: "asc" } }),
    searchParams,
  ]);

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-8">
      <PageHeader
        title="Choose your companion"
        description="One friend to begin your grove adventure. Choose warmly — they will be with you for a long time."
      />

      <FeedbackBanner error={firstParam(params.error)} />

      <form action={chooseStarterAction} className="mt-2">
        <fieldset>
          <legend className="text-sm font-semibold text-text">
            Companion
          </legend>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {species.map((s, index) => (
              <label
                key={s.id}
                className="flex cursor-pointer flex-col rounded-surface border-2 border-border bg-surface p-4 transition-colors has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  name="speciesSlug"
                  value={s.slug}
                  defaultChecked={index === 0}
                  className="sr-only"
                  required
                />
                <PetArt
                  artKey={s.artKey}
                  label={`${s.name} illustration`}
                  className="mx-auto h-28 w-28"
                />
                <span className="mt-2 text-center font-semibold">{s.name}</span>
                <span className="mt-1 text-center text-xs text-text-muted">
                  {s.description}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 max-w-sm">
          <FormField
            label="Name your companion"
            htmlFor="petName"
            help="2–24 characters. You can always call them something sweeter later."
          >
            <Input
              id="petName"
              name="petName"
              type="text"
              required
              minLength={2}
              maxLength={24}
              aria-describedby="petName-help"
            />
          </FormField>
        </div>

        <SubmitButton
          pendingLabel="Beginning…"
          className="mt-6 w-full max-w-sm"
        >
          Begin the adventure
        </SubmitButton>
      </form>
    </main>
  );
}
