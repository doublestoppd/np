import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { ensureHollow } from "@/server/modules/hollow/commands";
import {
  getHollow,
  listCatalogue,
  listPlaceable,
  type HollowSceneView,
  type PlacedFurnishing,
} from "@/server/modules/hollow/queries";
import { sizeFits } from "@/server/modules/hollow/config";
import {
  buyAirAction,
  buyGroundAction,
  clearAnchorAction,
  moveSceneAction,
  placeFurnishingAction,
  moveFurnishingAction,
  setCaptionAction,
  setSceneAirAction,
} from "@/server/actions/hollow";
import { HollowSceneArt } from "@/components/hollow/hollow-scene";
import { ConfirmedSpend } from "@/components/hollow/confirmed-spend";
import { LinkButton } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";
import { coinsFromJSON } from "@/lib/money";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Your Hollow" };

/**
 * Indexed by how many grounds are held, so the heading can say "your
 * second ground" — without it, three identical prices on three different
 * pictures read as a bug rather than as the rule they are.
 */
const ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
];

/**
 * The Hollow.
 *
 * The whole page is server-rendered forms — no drag canvas, no client
 * state. Arranging is "tap a place, tap a thing", which is two taps on a
 * phone, works with a keyboard without a parallel implementation, and
 * gives a screen reader the same picture in the same order (see
 * describeScene). A free-form canvas would fail all three, and would hand
 * the server pixel coordinates it has no business trusting.
 */
export default async function HollowPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  await ensureHollow(prisma, user.id);
  const [hollow, params] = await Promise.all([
    getHollow(prisma, { userId: user.id }),
    searchParams,
  ]);
  if (!hollow) {
    return null;
  }

  const openKey = firstParam(params.place);
  const nextPrice =
    hollow.nextGroundPrice === null
      ? null
      : coinsFromJSON(hollow.nextGroundPrice);
  const unheldGrounds = hollow.grounds.filter((ground) => !ground.held);
  const unheldAirs = hollow.airs.filter((air) => !air.held);

  return (
    <>
      <PageHeader
        title="Your Hollow"
        description="Somewhere of your own. Nothing here does anything, which is rather the point."
        actions={<LinkButton href="/hollow/catalogue">Catalogue</LinkButton>}
      />
      <FeedbackBanner
        notice={firstParam(params.notice)}
        error={firstParam(params.error)}
      />
      <p className="mb-4 text-sm text-text-muted">
        <TextLink href={`/u/${user.username}/hollow`}>
          See it the way a visitor does
        </TextLink>
      </p>

      {hollow.scenes.map((scene, index) => (
        <Surface
          as="section"
          key={scene.id}
          raised
          className="mb-6"
          aria-labelledby={`scene-${scene.id}`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={`scene-${scene.id}`}
              className="font-display text-lg font-semibold"
            >
              {scene.groundName}
            </h2>
            {hollow.scenes.length > 1 && (
              <div className="flex gap-1">
                <form action={moveSceneAction}>
                  <input type="hidden" name="sceneId" value={scene.id} />
                  <input type="hidden" name="direction" value="up" />
                  <IconButton
                    label={`Move ${scene.groundName} earlier`}
                    disabled={index === 0}
                    type="submit"
                  >
                    ↑
                  </IconButton>
                </form>
                <form action={moveSceneAction}>
                  <input type="hidden" name="sceneId" value={scene.id} />
                  <input type="hidden" name="direction" value="down" />
                  <IconButton
                    label={`Move ${scene.groundName} later`}
                    disabled={index === hollow.scenes.length - 1}
                    type="submit"
                  >
                    ↓
                  </IconButton>
                </form>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-text-muted">
            {scene.groundDescription}
          </p>

          <div className="mt-3">
            <HollowSceneArt scene={scene} aspect="wide" />
          </div>

          {/* The places, back to front. A grid rather than a scrolling
              row: eight chips in a scroller clipped their labels mid-word
              at 360px, and a place you cannot read the name of is not a
              place you can choose. */}
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {scene.anchors.map((anchor) => {
              const open = openKey === `${scene.id}:${anchor.key}`;
              return (
                <li key={anchor.key}>
                  <TextLink
                    href={
                      open
                        ? "/hollow"
                        : `/hollow?place=${encodeURIComponent(`${scene.id}:${anchor.key}`)}#place`
                    }
                    className={`flex min-h-11 flex-col justify-center rounded-control border px-3 py-1 text-sm no-underline ${
                      open
                        ? "border-accent bg-accent-soft"
                        : "border-border bg-surface"
                    }`}
                  >
                    <span className="font-medium text-text">{anchor.label}</span>
                    <span className="truncate text-xs text-text-muted">
                      {anchor.standing ? anchor.standing.name : "empty"}
                    </span>
                  </TextLink>
                </li>
              );
            })}
          </ul>

          {scene.anchors.map((anchor) =>
            openKey === `${scene.id}:${anchor.key}` ? (
              <AnchorEditor
                key={anchor.key}
                userId={user.id}
                scenes={hollow.scenes}
                sceneId={scene.id}
                anchorKey={anchor.key}
                anchorLabel={anchor.label}
                maxSize={anchor.maxSize}
                standing={anchor.standing}
              />
            ) : null,
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <form action={setCaptionAction} className="flex flex-col gap-2">
              <input type="hidden" name="sceneId" value={scene.id} />
              <label
                className="text-sm font-medium"
                htmlFor={`caption-${scene.id}`}
              >
                Caption
              </label>
              <Input
                id={`caption-${scene.id}`}
                name="caption"
                defaultValue={scene.caption}
                maxLength={120}
                placeholder="Say something about this place"
              />
              <SubmitButton variant="secondary" pendingLabel="Saving…">
                Save caption
              </SubmitButton>
            </form>

            <div>
              <p className="text-sm font-medium">Light</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {hollow.airs
                  .filter((air) => air.held)
                  .map((air) => (
                    <li key={air.key}>
                      <form action={setSceneAirAction}>
                        <input type="hidden" name="sceneId" value={scene.id} />
                        <input type="hidden" name="airKey" value={air.key} />
                        <SubmitButton
                          variant={air.key === scene.airKey ? "primary" : "quiet"}
                          pendingLabel="…"
                        >
                          {air.name}
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </Surface>
      ))}

      {unheldGrounds.length > 0 && (
        <section aria-labelledby="grounds-heading" className="mt-8">
          <SectionHeading
            id="grounds-heading"
            description={
              nextPrice === null
                ? "No more ground for now."
                : `Your ${ORDINALS[hollow.sceneCount] ?? `${hollow.sceneCount + 1}th`} ground costs the same whichever you pick — the price follows how much you already have, never which picture you like.`
            }
          >
            More ground
          </SectionHeading>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {unheldGrounds.map((ground) => (
              <Surface as="li" key={ground.key}>
                <h3 className="font-display font-semibold">{ground.name}</h3>
                <p className="mt-1 text-sm text-text-muted">
                  {ground.description}
                </p>
                {nextPrice !== null && (
                  <div className="mt-3">
                    <ConfirmedSpend
                      action={buyGroundAction}
                      hiddenFields={{
                        groundKey: ground.key,
                        idempotencyKey: crypto.randomUUID(),
                      }}
                      price={hollow.nextGroundPrice ?? "0"}
                      variant="primary"
                      pendingLabel="Taking it on…"
                      title={`Take on ${ground.name}?`}
                      description={ground.description}
                      label={
                        <>
                          Take on
                          {/* Named: three grounds otherwise rendered three
                              character-identical buttons. */}
                          <span className="sr-only"> {ground.name}</span>
                          <span aria-hidden="true"> it</span> —{" "}
                          <CurrencyAmount amount={nextPrice} compact />
                        </>
                      }
                    />
                  </div>
                )}
              </Surface>
            ))}
          </ul>
        </section>
      )}

      {unheldAirs.length > 0 && (
        <section aria-labelledby="airs-heading" className="mt-8">
          <SectionHeading
            id="airs-heading"
            description="An air belongs to you, not to one ground: buy it once and put it on any of them, as often as you like."
          >
            Other light
          </SectionHeading>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {unheldAirs.map((air) => (
              <Surface as="li" key={air.key}>
                <h3 className="font-display font-semibold">{air.name}</h3>
                <p className="mt-1 text-sm text-text-muted">{air.description}</p>
                <div className="mt-3">
                  <ConfirmedSpend
                    action={buyAirAction}
                    hiddenFields={{
                      airKey: air.key,
                      idempotencyKey: crypto.randomUUID(),
                    }}
                    price={air.price}
                    variant="primary"
                    pendingLabel="Buying…"
                    title={`Buy the ${air.name} air?`}
                    description={air.description}
                    label={
                      <>
                        Buy
                        <span className="sr-only"> the {air.name} air</span> —{" "}
                        <CurrencyAmount
                          amount={coinsFromJSON(air.price)}
                          compact
                        />
                      </>
                    }
                  />
                </div>
              </Surface>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * The sheet for one place: what you own that fits here, or — if something
 * is already standing there — where else it could go and how to put it
 * away. Rendered inline rather than in a modal so it needs no client
 * JavaScript and survives a page without it.
 *
 * Moving is offered before taking away, and that ordering is the whole
 * point of it: a growing furnishing keeps its clock when it moves and
 * loses it when it comes out, so a player who wants to rearrange must not
 * have to reach for the control that costs them two months.
 */
async function AnchorEditor({
  userId,
  scenes,
  sceneId,
  anchorKey,
  anchorLabel,
  maxSize,
  standing,
}: {
  userId: string;
  scenes: HollowSceneView[];
  sceneId: string;
  anchorKey: string;
  anchorLabel: string;
  maxSize: string;
  standing: PlacedFurnishing | null;
}) {
  if (standing) {
    // Every empty place, across every ground, that this thing would fit.
    const destinations = scenes.flatMap((scene) =>
      scene.anchors
        .filter(
          (anchor) =>
            anchor.standing === null &&
            !(scene.id === sceneId && anchor.key === anchorKey) &&
            sizeFits(standing.size, anchor.maxSize),
        )
        .map((anchor) => ({ scene, anchor })),
    );

    return (
      <Surface id="place" className="mt-3 scroll-mt-4" density="compact">
        <h3 className="font-display font-semibold">{anchorLabel}</h3>
        <p className="mt-2 text-sm text-text-muted">
          {standing.name} is standing here.
          {standing.growing ? " It is still growing." : ""}
        </p>

        {destinations.length > 0 && (
          <>
            <p className="mt-3 text-sm font-medium">Move it to</p>
            <ul className="mt-2 flex flex-col gap-2">
              {destinations.map(({ scene, anchor }) => (
                <li key={`${scene.id}:${anchor.key}`}>
                  <form action={moveFurnishingAction}>
                    <input type="hidden" name="fromSceneId" value={sceneId} />
                    <input type="hidden" name="fromAnchorKey" value={anchorKey} />
                    <input type="hidden" name="toSceneId" value={scene.id} />
                    <input type="hidden" name="toAnchorKey" value={anchor.key} />
                    <SubmitButton
                      variant="secondary"
                      pendingLabel="Moving it…"
                      className="w-full"
                    >
                      <span className="sr-only">
                        Move {standing.name} to{" "}
                      </span>
                      {anchor.label}
                      {scenes.length > 1 ? `, ${scene.groundName}` : ""}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}

        <form action={clearAnchorAction} className="mt-3">
          <input type="hidden" name="sceneId" value={sceneId} />
          <input type="hidden" name="anchorKey" value={anchorKey} />
          <SubmitButton variant="destructiveQuiet" pendingLabel="Taking it away…">
            Put
            <span className="sr-only"> {standing.name}</span>
            <span aria-hidden="true"> it</span> away
          </SubmitButton>
          {standing.growing && (
            <p className="mt-1 text-xs text-text-muted">
              Putting it away starts its growing over. Moving it does not.
            </p>
          )}
        </form>
      </Surface>
    );
  }

  const options = await listPlaceable(prisma, { userId, maxSize });
  // Distinguishes "you have none" from "yours are all out already".
  const ownsAnything = (await listCatalogue(prisma, { userId })).some(
    (entry) => entry.owned > 0,
  );
  return (
    <Surface id="place" className="mt-3 scroll-mt-4" density="compact">
      <h3 className="font-display font-semibold">{anchorLabel}</h3>
      {options.length === 0 ? (
        /* "Nothing you own fits here" was a misdiagnosis: the usual reason
           the list is empty is that everything the player owns is already
           standing somewhere, and the word "fits" convinced a player that
           places were type-restricted and spent several minutes proving
           they were not. Say which it is. */
        <p className="mt-2 text-sm text-text-muted">
          {ownsAnything
            ? "Everything you own is already standing somewhere. Move something here, or "
            : "Nothing you own would go here yet. "}
          <TextLink href="/hollow/catalogue">
            have a look at what&rsquo;s about
          </TextLink>
          .
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {options.map((option) => (
            <li key={option.slug}>
              <form action={placeFurnishingAction}>
                <input type="hidden" name="sceneId" value={sceneId} />
                <input type="hidden" name="anchorKey" value={anchorKey} />
                <input type="hidden" name="slug" value={option.slug} />
                <SubmitButton
                  variant="secondary"
                  pendingLabel="Setting it down…"
                  className="w-full"
                >
                  {/* A bare noun on a button is meaningless in a button
                      list; the verb and the destination carry it. */}
                  <span className="sr-only">Put </span>
                  {option.name}
                  <span className="sr-only"> at {anchorLabel}</span>
                  {option.spare > 1 ? ` (${option.spare} spare)` : ""}
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
