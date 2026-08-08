import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { applyStatDecay } from "@/server/modules/pets/pet-stats";
import { describeNourishment, describeStats } from "@/lib/pet-condition";
import { getActivityDirectory } from "@/server/modules/directory/activity-directory";
import { getArrivals } from "@/server/modules/arrivals/queries";
import {
  feedPetAction,
  playWithPetAction,
  readToPetAction,
} from "@/server/actions/pets";
import { PLAY_COOLDOWN_MINUTES } from "@/server/modules/pets/play-config";
import { PetArt, seasonsSince } from "@/components/pet/pet-art";
import { PetConditionMeter } from "@/components/pet/pet-condition-meter";
import { ItemArt } from "@/components/art/item-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { ItemIdentity } from "@/components/ui/item-identity";
import { ActivityDirectoryList } from "@/components/daily/activity-directory-list";
import { ArrivalsPanel } from "@/components/home/arrivals-panel";
import { FondnessShelf } from "@/components/pet/fondness-shelf";
import { ReadingShelf } from "@/components/pet/reading-shelf";
import { getFondness, getReadingShelf } from "@/server/modules/pets/queries";
import { getHollow } from "@/server/modules/hollow/queries";
import { HollowSceneArt } from "@/components/hollow/hollow-scene";
import { LinkButton } from "@/components/ui/button";
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

  const [
    careEntries,
    toyUses,
    params,
    activities,
    arrivals,
    fondness,
    shelf,
    hollow,
  ] = await Promise.all([
      prisma.inventoryEntry.findMany({
        where: {
          userId: user.id,
          quantity: { gt: 0 },
          item: {
            type: { in: ["FOOD", "TOY", "BOOK"] },
            lifecycle: { in: ["ACTIVE", "RETIRED"] },
          },
        },
        include: { item: { include: { category: true } } },
        orderBy: { item: { name: "asc" } },
      }),
      prisma.petToyUse.findMany({ where: { petId: pet.id } }),
      searchParams,
      getActivityDirectory(prisma, { userId: user.id }),
      getArrivals(prisma, { userId: user.id }),
      getFondness(prisma, { petId: pet.id }),
      getReadingShelf(prisma, { petId: pet.id }),
      // Read-only: a Hollow is opened by visiting it, never by rendering
      // the home page, so this is null until the player goes there once.
      getHollow(prisma, { userId: user.id }),
    ]);
  const foodEntries = careEntries.filter((e) => e.item.type === "FOOD");
  const toyEntries = careEntries.filter((e) => e.item.type === "TOY");
  const bookEntries = careEntries.filter((e) => e.item.type === "BOOK");
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

  // "Welcome back" was the first sentence a brand-new player ever read,
  // and it told them they had already missed something.
  const firstSession = Date.now() - user.createdAt.getTime() < 30 * 60_000;

  // Current stats are derived on the server from the stored snapshot, then
  // described in words — the raw values never reach the page.
  const conditions = describeStats(
    applyStatDecay(pet, pet.statsUpdatedAt, new Date()),
  );

  return (
    <>
      <PageHeader
        title={
          firstSession
            ? `Welcome, ${user.username}`
            : `Welcome back, ${user.username}`
        }
        description={
          firstSession
            ? "Have a look around, earn a few coins from today's things, and start making somewhere of your own."
            : "Good to see you again."
        }
      />

      <FeedbackBanner
        notice={firstParam(params.notice)}
        error={firstParam(params.error)}
      />

      {/* Renders nothing at all when nothing happened. */}
      <ArrivalsPanel arrivals={arrivals} />

      <Surface as="section" raised aria-labelledby="pet-heading">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <ArtworkFrame aspect="square" className="w-40 shrink-0">
            <PetArt
              artKey={pet.species.artKey}
              label={`${pet.name}, a ${pet.species.name}`}
              mood={conditions.find((c) => c.stat === "happiness")?.level ?? 3}
              seasons={seasonsSince(pet.createdAt)}
            />
          </ArtworkFrame>
          <div className="w-full text-center sm:text-left">
            <h2 id="pet-heading" className="font-display text-xl font-bold">
              {pet.name}
            </h2>
            <p className="text-sm text-text-muted">{pet.species.name}</p>
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

      <FondnessShelf fondness={fondness} headingId="fondness-heading" />

      <ReadingShelf shelf={shelf} headingId="reading-heading" />

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

      {/* Deliberately its own section rather than a line in the daily list:
          the Hollow has no reset, no streak, and nothing waiting to be
          claimed, and putting it among things that expire would make it
          feel like one. It is also the answer to "what is all this for",
          so it is shown rather than mentioned — a text link at the foot of
          a list was findable only by a player already looking for it. */}
      <section aria-labelledby="hollow-heading" className="mt-6">
        <SectionHeading
          id="hollow-heading"
          description="Somewhere of your own. No hurry at all — it keeps."
        >
          Your Hollow
        </SectionHeading>
        <Surface className="mt-3">
          {hollow?.scenes[0] ? (
            <>
              <HollowSceneArt scene={hollow.scenes[0]} />
              <div className="mt-3">
                <LinkButton href="/hollow" variant="secondary">
                  Go and arrange it
                </LinkButton>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-text-muted">
                A clearing nobody has claimed, eight places to stand things, and
                a catalogue that starts at 180 coins. Nothing in it does
                anything, which is rather the point.
              </p>
              <div className="mt-3">
                <LinkButton href="/hollow">Have a look</LinkButton>
              </div>
            </>
          )}
        </Surface>
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
                        <input
                          type="hidden"
                          name="itemId"
                          value={entry.itemId}
                        />
                        <IdempotencyField />
                        <SubmitButton pendingLabel="Playing…">
                          Play
                          <span className="sr-only">
                            {" "}
                            with {entry.item.name}
                          </span>
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

      {/* Reading sits with feeding and playing rather than on the shelf
          above, because it is a thing you DO with your companion — and
          because a book is consumed by it, which belongs next to the other
          two actions that consume something. */}
      <section aria-labelledby="read-heading" className="mt-6">
        <SectionHeading
          id="read-heading"
          description="Reading destroys the copy — for good. What stays is the title, on your companion's shelf."
        >
          Read to {pet.name}
        </SectionHeading>
        {bookEntries.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="📖"
              headingAs="h3"
              title="No books in the satchel"
              description="A book read aloud is gone for good, and the title stays on the shelf. The Quiet Bindery in Dapplewood sells nothing else."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {bookEntries.map((entry) => (
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
                meta={`×${entry.quantity} · read aloud`}
                action={
                  <form action={readToPetAction}>
                    <input type="hidden" name="petId" value={pet.id} />
                    <input type="hidden" name="itemId" value={entry.itemId} />
                    <IdempotencyField />
                    <SubmitButton pendingLabel="Reading…">
                      Read
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
