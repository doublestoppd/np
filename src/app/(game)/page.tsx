import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { applyStatDecay } from "@/server/services/pet-stats";
import { feedPetAction } from "@/server/actions/pets";
import { PetArt } from "@/components/pet/pet-art";
import { StatBar } from "@/components/pet/stat-bar";
import { FeedbackBanner, firstParam } from "@/components/feedback-banner";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  const pet = await prisma.pet.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    include: { species: true },
  });
  if (!pet) {
    redirect("/starter");
  }

  const [foodEntries, params] = await Promise.all([
    prisma.inventoryEntry.findMany({
      where: { userId: user.id, quantity: { gt: 0 }, item: { type: "FOOD" } },
      include: { item: true },
      orderBy: { item: { name: "asc" } },
    }),
    searchParams,
  ]);

  // Current stats are derived on the server from the stored snapshot.
  const stats = applyStatDecay(pet, pet.statsUpdatedAt, new Date());

  return (
    <>
      <h1 className="text-2xl font-bold text-emerald-900">Home</h1>

      <div className="mt-4">
        <FeedbackBanner
          notice={firstParam(params.notice)}
          error={firstParam(params.error)}
        />
      </div>

      <section
        aria-labelledby="pet-heading"
        className="rounded-2xl border border-stone-200 bg-white p-5"
      >
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <PetArt
            artKey={pet.species.artKey}
            label={`${pet.name}, a ${pet.species.name}`}
            className="h-40 w-40 shrink-0"
          />
          <div className="w-full text-center sm:text-left">
            <h2 id="pet-heading" className="text-xl font-bold">
              {pet.name}
            </h2>
            <p className="text-sm text-stone-600">
              {pet.species.name} · Level {pet.level}
            </p>
            <p className="mt-2 text-sm text-stone-600">
              {pet.species.description}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatBar label="Hunger" value={stats.hunger} colorClass="bg-amber-500" />
          <StatBar
            label="Happiness"
            value={stats.happiness}
            colorClass="bg-pink-500"
          />
          <StatBar label="Energy" value={stats.energy} colorClass="bg-sky-500" />
          <StatBar
            label="Health"
            value={stats.health}
            colorClass="bg-emerald-600"
          />
        </div>
      </section>

      <section aria-labelledby="feed-heading" className="mt-6">
        <h2 id="feed-heading" className="text-lg font-semibold">
          Feed {pet.name}
        </h2>
        {foodEntries.length === 0 ? (
          <p className="mt-2 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
            You have no food right now. Visit the shop once it opens, or check
            back for daily rewards.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {foodEntries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{entry.item.name}</p>
                  <p className="text-xs text-stone-600">
                    ×{entry.quantity} · restores {entry.item.hungerRestore ?? 0}{" "}
                    hunger
                  </p>
                </div>
                <form action={feedPetAction}>
                  <input type="hidden" name="petId" value={pet.id} />
                  <input type="hidden" name="itemId" value={entry.itemId} />
                  <button
                    type="submit"
                    className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                  >
                    Feed<span className="sr-only"> {entry.item.name}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
