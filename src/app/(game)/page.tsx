import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { applyStatDecay, STAT_MAX } from "@/server/modules/pets/pet-stats";
import {
  applyAilment,
  ensureAilmentForToday,
} from "@/server/modules/pets/ailments";
import { bondBand } from "@/server/modules/pets/bond";
import { ensureKeepsakeForToday } from "@/server/modules/pets/keepsakes";
import {
  GROOM_COOLDOWN_MINUTES,
  SIT_COOLDOWN_MINUTES,
} from "@/server/modules/pets/play-config";
import {
  describeGrooming,
  describeNourishment,
  describeStats,
} from "@/lib/pet-condition";
import { getArrivals } from "@/server/modules/arrivals/queries";
import {
  feedPetAction,
  groomPetAction,
  playWithPetAction,
  readToPetAction,
  sitWithPetAction,
  takeKeepsakeAction,
  treatPetAction,
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
    groomUses,
    params,
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
            type: { in: ["FOOD", "TOY", "BOOK", "REMEDY", "GROOMING_TOOL"] },
            lifecycle: { in: ["ACTIVE", "RETIRED"] },
          },
        },
        include: { item: { include: { category: true } } },
        orderBy: { item: { name: "asc" } },
      }),
      prisma.petToyUse.findMany({ where: { petId: pet.id } }),
      prisma.petGroomUse.findMany({ where: { petId: pet.id } }),
      searchParams,
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
  const remedyEntries = careEntries.filter((e) => e.item.type === "REMEDY");
  const toolEntries = careEntries.filter((e) => e.item.type === "GROOMING_TOOL");
  // A toy the companion has tired of is shown as resting rather than
  // hidden — the player owns it, and the rule is that variety is what
  // works, which they can only learn if they can see it.
  const readyAt = new Map(
    toyUses.map((use) => [
      use.itemId,
      use.lastUsedAt.getTime() + PLAY_COOLDOWN_MINUTES * 60_000,
    ]),
  );
  const groomReadyAt = new Map(
    groomUses.map((use) => [
      use.itemId,
      use.lastUsedAt.getTime() + GROOM_COOLDOWN_MINUTES * 60_000,
    ]),
  );
  const nowMs = Date.now();

  // "Welcome back" was the first sentence a brand-new player ever read,
  // and it told them they had already missed something.
  const firstSession = Date.now() - user.createdAt.getTime() < 30 * 60_000;

  // Current stats are derived on the server from the stored snapshot, then
  // described in words — the raw values never reach the page.
  const now = new Date();
  /**
   * Drawn on read, like the lantern's hunt (ADR-60). There is no cron
   * behind this and there does not need to be: an ailment nobody looked at
   * may as well not have happened, and the roll is keyed to the day so
   * refreshing asks the same question and gets the same answer.
   */
  const decayed = applyStatDecay(pet, pet.statsUpdatedAt, now);
  const ailment = await ensureAilmentForToday(prisma, {
    petId: pet.id,
    coat: decayed.coat ?? pet.coat,
    bond: pet.bond,
  });
  const stats = applyAilment(decayed, ailment, {
    from: pet.statsUpdatedAt,
    now,
  });
  const conditions = describeStats({
    hunger: stats.hunger,
    happiness: stats.happiness,
    energy: stats.energy,
    health: stats.health,
    coat: stats.coat ?? pet.coat,
  });
  const bond = bondBand(pet.bond);
  /**
   * Also drawn on read, and for the same reasons (ADR-61). Deliberately
   * AFTER the ailment and the decay, because whether a companion went out
   * and found something depends on how they are doing right now — and it
   * writes the row only. Nothing enters a satchel from rendering a page.
   */
  const keepsake = await ensureKeepsakeForToday(prisma, {
    petId: pet.id,
    bond: pet.bond,
    happiness: stats.happiness,
    hunger: stats.hunger,
  });
  const sittingReadyAt = pet.lastSatWithAt
    ? pet.lastSatWithAt.getTime() + SIT_COOLDOWN_MINUTES * 60_000
    : 0;

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
            ? "Have a look around, and start making somewhere of your own."
            : "Good to see you again."
        }
      />

      {/* One line, not the list again.
          Moving the directory to its own tab left this page's welcome
          saying "earn a few coins from today's things" with no such thing
          anywhere on it — a sentence pointing at a section that had gone.
          A link says where they went without putting two copies of the
          same rows back in two places. */}
      <p className="mt-1 text-sm text-text-muted">
        Today&apos;s activities are on the{" "}
        <TextLink href="/activities">Activities</TextLink> tab, and they all
        reset at midnight GST.
      </p>

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
            {/* The bond, in words and never as a number (ADR-60). It only
                ever goes up, so this line can only ever get warmer — which
                is the point of having it. */}
            <p className="mt-2 text-sm font-medium text-text">{bond.name}</p>
            <p className="text-xs text-text-muted">{bond.blurb}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {conditions.map((condition) => (
            <PetConditionMeter key={condition.stat} condition={condition} />
          ))}
        </div>

        {/* The one thing that is always available (ADR-61).
            Placed inside the companion's own card rather than down among
            the item shelves, because it needs nothing from a satchel — and
            first, above the ailment, because sitting with something that is
            unwell is the most natural thing to do and the panel below it
            explains why they might want to. */}
        <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-prose text-sm text-text-muted">
            {sittingReadyAt <= nowMs
              ? "Costs nothing, needs nothing, and is never unavailable."
              : "You have just been sitting with them. Come back to it later."}
          </p>
          {sittingReadyAt <= nowMs && (
            <form action={sitWithPetAction} className="shrink-0">
              <input type="hidden" name="petId" value={pet.id} />
              <IdempotencyField />
              <SubmitButton variant="secondary" pendingLabel="Sitting…">
                Sit with {pet.name}
              </SubmitButton>
            </form>
          )}
        </div>

        {/* Something they left out for you (ADR-61). Renders nothing at all
            on the days there is nothing, which is most days. */}
        {keepsake && (
          <div className="mt-4 rounded-control border border-border-strong bg-surface-sunken p-3">
            <h3 className="text-sm font-semibold text-text">
              {pet.name} left you something
            </h3>
            <div className="mt-3">
              <ItemIdentity
                size="sm"
                name={keepsake.itemName}
                art={
                  <ItemArt
                    artKey={keepsake.artKey ?? keepsake.itemSlug}
                    categorySlug={keepsake.categorySlug ?? undefined}
                    label=""
                  />
                }
                meta={keepsake.line}
                action={
                  <form action={takeKeepsakeAction}>
                    <input type="hidden" name="petId" value={pet.id} />
                    <input type="hidden" name="keepsakeId" value={keepsake.id} />
                    <IdempotencyField />
                    <SubmitButton pendingLabel="Taking…">
                      Take it
                      <span className="sr-only"> — {keepsake.itemName}</span>
                    </SubmitButton>
                  </form>
                }
              />
            </div>
          </div>
        )}

        {/* Under the weather.
            Renders nothing at all when nothing is wrong — a permanent
            "healthy!" panel would turn an ordinary companion into a
            checklist. The comfort line is not decoration: the first thing
            a player wants to know is whether they have broken something,
            and the answer is always no. */}
        {ailment && (
          <div className="mt-5 rounded-control border border-border-strong bg-surface-sunken p-3">
            <h3 className="text-sm font-semibold text-text">
              <span aria-hidden="true">🌡️</span> {pet.name} has {ailment.name}
            </h3>
            <p className="mt-1 max-w-prose text-sm text-text-muted">
              {ailment.symptom}
            </p>
            <p className="mt-2 max-w-prose text-sm text-text">
              {ailment.comfort}
            </p>
            {remedyEntries.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">
                Nothing in the satchel for it. It passes on its own either
                way — the Physic Shed at Beechrow Physic Garden sells things
                that hurry it along.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {remedyEntries.map((entry) => (
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
                    meta={`×${entry.quantity}`}
                    action={
                      <form action={treatPetAction}>
                        <input type="hidden" name="petId" value={pet.id} />
                        <input type="hidden" name="itemId" value={entry.itemId} />
                        <IdempotencyField />
                        <SubmitButton pendingLabel="Giving…">
                          Give
                          <span className="sr-only"> {entry.item.name}</span>
                        </SubmitButton>
                      </form>
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </Surface>

      <FondnessShelf fondness={fondness} headingId="fondness-heading" />

      <ReadingShelf shelf={shelf} headingId="reading-heading" />

      {/* The day's activities used to be listed here as well as on the
          Activities tab — the same rows, from the same query, twice. Two
          copies of a list is two places to check and two places to be out
          of date, and it pushed the companion's own page down past a
          directory that already has a tab of its own. The tab is where
          they live now. */}

      {/* Deliberately here rather than on the Activities tab: the Hollow
          has no reset, no streak, and nothing waiting to be claimed, and
          listing it among things that expire would make it feel like one.
          It is also the answer to "what is all this for", so it is shown
          rather than mentioned — a text link at the foot of a list was
          findable only by a player already looking for it. */}
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
              // Names somewhere to go, because the book shelf below
              // already did and these two did not. A player at zero coins
              // with a hungry companion was shown an empty box and told
              // that food "will show up here" — true, and no help at all,
              // when the day's meal is free and open right then.
              //
              // Both places named here are checked against the content:
              // the Hearth and Ladle hosts the daily meal, and the Mossy
              // Market stocks food. Rename either and this line has to
              // move with it.
              description="The Hearth and Ladle in Dapplewood gives one out free every day, and the Mossy Market there sells food. Anything edible you find turns up here too."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {foodEntries.map((entry) => {
              /**
               * A meal that would overfill is refused by the command, and
               * the button used to give no warning of it — so a brand-new
               * player's very FIRST action failed every time: a starter
               * pet is created at hunger 80 and handed a 30-hunger loaf,
               * and 80 + 30 is over the maximum. Their first tap on a
               * companion described as "Well fed" produced a red banner.
               *
               * The toy list directly below already had the answer: it
               * computes whether the toy is ready, says so in the meta
               * line, and simply omits the button. This is that, for food.
               */
              const fits =
                stats.hunger + (entry.item.hungerRestore ?? 0) <= STAT_MAX;
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
                  fits
                    ? `×${entry.quantity} · ${describeNourishment(
                        entry.item.hungerRestore,
                      )}`
                    : `×${entry.quantity} · too much just now`
                }
                action={
                  fits ? (
                    <form action={feedPetAction}>
                      <input type="hidden" name="petId" value={pet.id} />
                      <input type="hidden" name="itemId" value={entry.itemId} />
                      <IdempotencyField />
                      <SubmitButton pendingLabel="Feeding…">
                        Feed
                        <span className="sr-only"> {entry.item.name}</span>
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

      <section aria-labelledby="play-heading" className="mt-6">
        <SectionHeading id="play-heading">Play with {pet.name}</SectionHeading>
        {toyEntries.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="🪁"
              headingAs="h3"
              title="No playthings yet"
              description="Toys keep a companion in good spirits, and the same one twice in a row loses its charm — so a few different ones go further than a favourite. The Mossy Market in Dapplewood sells them, and the Saltmere shore turns them up for nothing."
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

      <section aria-labelledby="groom-heading" className="mt-6">
        <SectionHeading
          id="groom-heading"
          description="Brushes are kept, never used up. The same one twice running does nothing — a couple of different ones is the whole kit."
        >
          Brush {pet.name}
        </SectionHeading>
        {toolEntries.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="🧹"
              headingAs="h3"
              title="Nothing to brush with"
              description="A coat left alone gets untidy, and an untidy companion picks things up a little more easily. The Physic Shed at Beechrow Physic Garden sells brushes, combs and cloths — buy one and it lasts for good."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {toolEntries.map((entry) => {
              const ready = (groomReadyAt.get(entry.itemId) ?? 0) <= nowMs;
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
                      ? describeGrooming(entry.item.coatCare)
                      : "just been used — try another"
                  }
                  action={
                    ready ? (
                      <form action={groomPetAction}>
                        <input type="hidden" name="petId" value={pet.id} />
                        <input type="hidden" name="itemId" value={entry.itemId} />
                        <IdempotencyField />
                        <SubmitButton pendingLabel="Brushing…">
                          Brush
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
