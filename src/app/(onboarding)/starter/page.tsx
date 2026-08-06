import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { chooseStarterAction } from "@/server/actions/pets";
import { PetArt } from "@/components/pet/pet-art";
import { FeedbackBanner, firstParam } from "@/components/feedback-banner";

export const metadata: Metadata = { title: "Choose your companion" };

export default async function StarterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
      <h1 className="text-2xl font-bold text-emerald-900">
        Choose your companion
      </h1>
      <p className="mt-1 text-stone-600">
        One friend to begin your grove adventure. Choose warmly — they will be
        with you for a long time.
      </p>

      <FeedbackBanner error={firstParam(params.error)} />

      <form action={chooseStarterAction} className="mt-6">
        <fieldset>
          <legend className="text-sm font-semibold text-stone-700">
            Companion
          </legend>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {species.map((s, index) => (
              <label
                key={s.id}
                className="flex cursor-pointer flex-col rounded-xl border-2 border-stone-200 bg-white p-4 transition-colors has-checked:border-emerald-600 has-checked:bg-emerald-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-emerald-700"
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
                <span className="mt-1 text-center text-xs text-stone-600">
                  {s.description}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-6">
          <label
            htmlFor="petName"
            className="block text-sm font-semibold text-stone-700"
          >
            Name your companion
          </label>
          <input
            id="petName"
            name="petName"
            type="text"
            required
            minLength={2}
            maxLength={24}
            className="mt-1 w-full max-w-sm rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base focus:outline-2 focus:outline-offset-1 focus:outline-emerald-700"
          />
          <p className="mt-1 text-xs text-stone-500">
            2–24 characters. You can always call them something sweeter later.
          </p>
        </div>

        <button
          type="submit"
          className="mt-6 min-h-11 w-full max-w-sm rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          Begin the adventure
        </button>
      </form>
    </main>
  );
}
