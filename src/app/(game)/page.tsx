import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { applyStatDecay } from "@/server/modules/pets/pet-stats";
import { describeNourishment, describeStats } from "@/lib/pet-condition";
import { getActivityDirectory } from "@/server/modules/directory/activity-directory";
import { feedPetAction, playWithPetAction } from "@/server/actions/pets";
import { PLAY_COOLDOWN_MINUTES } from "@/server/modules/pets/play-config";
import { PetArt } from "@/components/pet/pet-art";
import { PetConditionMeter } from "@/components/pet/pet-condition-meter";
import { ItemArt } from "@/components/art/item-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { ItemIdentity } from "@/components/ui/item-identity";
import { ActivityDirectoryList } from "@/components/daily/activity-directory-list";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata = { title: "Home" };

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

  const [careEntries, toyUses, params, activities] = await Promise.all([
    prisma.inventoryEntry.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        item: {
          type: { in: ["FOOD", "TOY"] },
          lifecycle: { in: ["ACTIVE", "RETIRED"] },
        },
      },
      include: { item: { include: { category: true } } },
      orderBy: { item: { name: "asc" } },
    }),
    prisma.petToyUse.findMany({ where: { petId: pet.id } }),
    searchParams,
    getActivityDirectory(prisma, { userId: user.id }),
  ]);
  const foodEntries = careEntries.filter((e) => e.item.type === "FOOD");
  const toyEntries = careEntries.filter((e) => e.item.type === "TOY");
  // A toy the companion has tired of is shown as resting rather than
  // hidden — the player owns it, and the rule is that variety is what
  // works, which they can only learn if they can see it.
  const readyAt = new Map(
    toyUses.map((use) => [
      use.itemId,
      use.lastUsedAt.getTime() + PLAY_COOLDOWN_MINUTES * 60_000,
    ]),
  );
  const nowMs = Date.now();

  // Current stats are derived on the server from the stored snapshot, then
  // described in words — the raw values never reach the page.
  const conditions = describeStats(
    applyStatDecay(pet, pet.statsUpdatedAt, new Date()),
  );

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.username}`}
        description="The grove is glad to see you."
      />

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
              {pet.species.name}
            </p>
            <p className="mt-2 text-sm text-text-muted">
              {pet.species.description}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {conditions.map((condition) => (
            <PetConditionMeter key={condition.stat} condition={condition} />
          ))}
        </div>
      </Surface>

      <section aria-labelledby="daily-heading" className="mt-6">
        <SectionHeading id="daily-heading">
          Today&apos;s activities
        </SectionHeading>
        <div className="mt-3">
          <ActivityDirectoryList entries={activities} />
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Everything resets at midnight UTC.{" "}
          <TextLink href="/history/daily">Activity history</TextLink>
        </p>
      </section>

      <section aria-labelledby="feed-heading" className="mt-6">
        <SectionHeading id="feed-heading">Feed {pet.name}</SectionHeading>
        {foodEntries.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="🍃"
              headingAs="h3"
              title="No food in the satchel"
              description="Anything edible you come across will show up here."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {foodEntries.map((entry) => (
              <ItemIdentity
                as="li"
                key={entry.id}
                size="sm"
                name={entry.item.name}
                href={`/items/${entry.item.slug}?from=home`}
                art={
                  <ItemArt
                    artKey={entry.item.artKey}
                    categorySlug={entry.item.category?.slug}
                    label=""
                  />
                }
                meta={`×${entry.quantity} · ${describeNourishment(
                  entry.item.hungerRestore,
                )}`}
                action={
                  <form action={feedPetAction}>
                    <input type="hidden" name="petId" value={pet.id} />
                    <input type="hidden" name="itemId" value={entry.itemId} />
                    <IdempotencyField />
                    <SubmitButton pendingLabel="Feeding…">
                      Feed
                      <span className="sr-only"> {entry.item.name}</span>
                    </SubmitButton>
                  </form>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="play-heading" className="mt-6">
        <SectionHeading id="play-heading">Play with {pet.name}</SectionHeading>
        {toyEntries.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="🪁"
              headingAs="h3"
              title="No playthings yet"
              description="Toys keep a companion in good spirits. The same one twice in a row loses its charm, so a few different ones go further than a favourite."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {toyEntries.map((entry) => {
              const ready = (readyAt.get(entry.itemId) ?? 0) <= nowMs;
              return (
                <ItemIdentity
                  as="li"
                  key={entry.id}
                  size="sm"
                  name={entry.item.name}
                  href={`/items/${entry.item.slug}?from=home`}
                  art={
                    <ItemArt
                      artKey={entry.item.artKey}
                      categorySlug={entry.item.category?.slug}
                      label=""
                    />
                  }
                  meta={
                    ready
                      ? `×${entry.quantity} · ready to play`
                      : `×${entry.quantity} · resting for now`
                  }
                  action={
                    ready ? (
                      <form action={playWithPetAction}>
                        <input type="hidden" name="petId" value={pet.id} />
                        <input type="hidden" name="itemId" value={entry.itemId} />
                        <IdempotencyField />
                        <SubmitButton pendingLabel="Playing…">
                          Play
                          <span className="sr-only"> with {entry.item.name}</span>
                        </SubmitButton>
                      </form>
                    ) : undefined
                  }
                />
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
