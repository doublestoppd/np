import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { applyStatDecay } from "@/server/modules/pets/pet-stats";
import { describeNourishment, describeStats } from "@/lib/pet-condition";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { getDailyStatus } from "@/server/modules/daily/status";
import {
  dailyLocationPath,
  MEAL_LOCATION_SLUG,
  WHEEL_LOCATION_SLUG,
  WORD_LOCATION_SLUG,
} from "@/server/modules/daily/locations";
import { feedPetAction } from "@/server/actions/pets";
import { PetArt } from "@/components/pet/pet-art";
import { PetConditionMeter } from "@/components/pet/pet-condition-meter";
import { ItemArt } from "@/components/art/item-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { ItemIdentity } from "@/components/ui/item-identity";
import {
  mealPanelStatus,
  wheelPanelStatus,
  wordPanelStatus,
} from "@/components/daily/daily-status-presentation";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
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

  const [foodEntries, params, daily] = await Promise.all([
    prisma.inventoryEntry.findMany({
      where: {
        userId: user.id,
        quantity: { gt: 0 },
        item: { type: "FOOD", lifecycle: { in: ["ACTIVE", "RETIRED"] } },
      },
      include: { item: { include: { category: true } } },
      orderBy: { item: { name: "asc" } },
    }),
    searchParams,
    getDailyStatus(prisma, { userId: user.id, gameDate: currentGameDate() }),
  ]);

  // The shared daily panel maps every activity onto the common player
  // status vocabulary: available, in progress, completed/claimed.
  const dailyRows = [
    {
      href: dailyLocationPath(WORD_LOCATION_SLUG),
      icon: "🔤",
      name: "Daily Word Challenge",
      place: "Whisperleaf Reading Room",
      ...wordPanelStatus(daily.wordCompleted),
    },
    {
      href: dailyLocationPath(WHEEL_LOCATION_SLUG),
      icon: "🎡",
      name: "Daily Prize Wheel",
      place: "Brassbell Pavilion",
      ...wheelPanelStatus(daily.wheel),
    },
    {
      href: dailyLocationPath(MEAL_LOCATION_SLUG),
      icon: "🥣",
      name: "Daily Community Meal",
      place: "Hearth and Ladle",
      ...mealPanelStatus(daily.meal),
    },
  ];

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
              {pet.species.name} · Level {pet.level}
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
        <ul className="mt-3 flex flex-col gap-2">
          {dailyRows.map((row) => (
            <Surface as="li" key={row.href} padded={false}>
              <Link
                href={row.href}
                className="flex min-h-11 items-center gap-3 rounded-surface p-3 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span aria-hidden="true" className="text-xl">
                  {row.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{row.name}</span>
                  <span className="block text-xs text-text-muted">
                    {row.place}
                  </span>
                </span>
                <StatusBadge status={row.status} label={row.label} />
              </Link>
            </Surface>
          ))}
        </ul>
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
    </>
  );
}
