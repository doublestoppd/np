import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { applyStatDecay } from "@/server/services/pet-stats";
import { feedPetAction } from "@/server/actions/pets";
import { PetArt } from "@/components/pet/pet-art";
import { StatBar } from "@/components/pet/stat-bar";
import { ItemArt } from "@/components/art/item-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { firstParam, type SearchParams } from "@/lib/search-params";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
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
      include: { item: { include: { category: true } } },
      orderBy: { item: { name: "asc" } },
    }),
    searchParams,
  ]);

  // Current stats are derived on the server from the stored snapshot.
  const stats = applyStatDecay(pet, pet.statsUpdatedAt, new Date());

  return (
    <>
      <PageHeader title="Home" />

      <FeedbackBanner
        notice={firstParam(params.notice)}
        error={firstParam(params.error)}
      />

      <Surface as="section" raised aria-labelledby="pet-heading">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <ArtworkFrame aspect="square" className="w-40 shrink-0">
            <PetArt
              artKey={pet.species.artKey}
              label={`${pet.name}, a ${pet.species.name}`}
            />
          </ArtworkFrame>
          <div className="w-full text-center sm:text-left">
            <h2 id="pet-heading" className="font-display text-xl font-bold">
              {pet.name}
            </h2>
            <p className="text-sm text-text-muted">
              {pet.species.name} · Level {pet.level}
            </p>
            <p className="mt-2 text-sm text-text-muted">
              {pet.species.description}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatBar
            label="Hunger"
            value={stats.hunger}
            colorClass="bg-stat-hunger"
          />
          <StatBar
            label="Happiness"
            value={stats.happiness}
            colorClass="bg-stat-happiness"
          />
          <StatBar
            label="Energy"
            value={stats.energy}
            colorClass="bg-stat-energy"
          />
          <StatBar
            label="Health"
            value={stats.health}
            colorClass="bg-stat-health"
          />
        </div>
      </Surface>

      <section aria-labelledby="feed-heading" className="mt-6">
        <h2 id="feed-heading" className="font-display text-lg font-semibold">
          Feed {pet.name}
        </h2>
        {foodEntries.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="🍃"
              title="No food in the satchel"
              description="Anything edible you come across will show up here."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {foodEntries.map((entry) => (
              <Surface as="li" key={entry.id} padded={false} className="p-3">
                <div className="flex items-center gap-3">
                  <ArtworkFrame aspect="square" className="w-14 shrink-0">
                    <ItemArt
                      artKey={entry.item.artKey}
                      categorySlug={entry.item.category?.slug}
                      label=""
                    />
                  </ArtworkFrame>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{entry.item.name}</p>
                    <p className="text-xs text-text-muted">
                      ×{entry.quantity} · restores{" "}
                      {entry.item.hungerRestore ?? 0} hunger
                    </p>
                  </div>
                  <form action={feedPetAction} className="shrink-0">
                    <input type="hidden" name="petId" value={pet.id} />
                    <input type="hidden" name="itemId" value={entry.itemId} />
                    <SubmitButton pendingLabel="Feeding…">
                      Feed
                      <span className="sr-only"> {entry.item.name}</span>
                    </SubmitButton>
                  </form>
                </div>
              </Surface>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
