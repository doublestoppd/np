import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { applyStatDecay } from "@/server/modules/pets/pet-stats";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { getDailyStatus } from "@/server/modules/daily/status";
import {
  dailyLocationPath,
  MEAL_LOCATION_SLUG,
  WHEEL_LOCATION_SLUG,
  WORD_LOCATION_SLUG,
} from "@/server/modules/daily/locations";
import { feedPetAction } from "@/server/actions/pets";
import { Badge } from "@/components/ui/badge";
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

  const dailyRows = [
    {
      href: dailyLocationPath(WORD_LOCATION_SLUG),
      icon: "🔤",
      name: "Daily Word Challenge",
      place: "Whisperleaf Reading Room",
      done: daily.wordCompleted === 3,
      status:
        daily.wordCompleted === 3
          ? "Done for today"
          : `${daily.wordCompleted}/3 puzzles done`,
    },
    {
      href: dailyLocationPath(WHEEL_LOCATION_SLUG),
      icon: "🎡",
      name: "Daily Prize Wheel",
      place: "Brassbell Pavilion",
      done: daily.wheel === "COMPLETED",
      status: daily.wheel === "COMPLETED" ? "Spun for today" : "Spin available",
    },
    {
      href: dailyLocationPath(MEAL_LOCATION_SLUG),
      icon: "🥣",
      name: "Daily Community Meal",
      place: "Hearth and Ladle",
      done: daily.meal === "CLAIMED",
      status: daily.meal === "CLAIMED" ? "Claimed for today" : "Meal available",
    },
  ];

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

      <section aria-labelledby="daily-heading" className="mt-6">
        <h2 id="daily-heading" className="font-display text-lg font-semibold">
          Today&apos;s activities
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {dailyRows.map((row) => (
            <Surface as="li" key={row.href} padded={false}>
              <Link
                href={row.href}
                className="flex items-center gap-3 rounded-surface p-3 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
                <Badge tone={row.done ? "neutral" : "success"}>
                  {row.status}
                </Badge>
              </Link>
            </Surface>
          ))}
        </ul>
        <p className="mt-2 text-xs text-text-muted">
          Everything resets at midnight UTC.{" "}
          <Link
            href="/history/daily"
            className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Activity history
          </Link>
        </p>
      </section>

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
