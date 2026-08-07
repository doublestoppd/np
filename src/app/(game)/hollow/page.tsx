import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { ensureHollow } from "@/server/modules/hollow/commands";
import { getHollow, listPlaceable } from "@/server/modules/hollow/queries";
import {
  buyAirAction,
  buyGroundAction,
  clearAnchorAction,
  moveSceneAction,
  placeFurnishingAction,
  setCaptionAction,
  setSceneAirAction,
} from "@/server/actions/hollow";
import { HollowSceneArt } from "@/components/hollow/hollow-scene";
import { LinkButton } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { IconButton } from "@/components/ui/icon-button";
import { IdempotencyField } from "@/components/ui/idempotency-field";
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
            <HollowSceneArt scene={scene} />
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
                sceneId={scene.id}
                anchorKey={anchor.key}
                anchorLabel={anchor.label}
                maxSize={anchor.maxSize}
                standingName={anchor.standing?.name ?? null}
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
                  <form action={buyGroundAction} className="mt-3">
                    <IdempotencyField />
                    <input
                      type="hidden"
                      name="groundKey"
                      value={ground.key}
                    />
                    <SubmitButton pendingLabel="Taking it on…">
                      Take it on — <CurrencyAmount amount={nextPrice} compact />
                    </SubmitButton>
                  </form>
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
                <form action={buyAirAction} className="mt-3">
                  <IdempotencyField />
                  <input type="hidden" name="airKey" value={air.key} />
                  <SubmitButton pendingLabel="Buying…">
                    Buy — <CurrencyAmount amount={coinsFromJSON(air.price)} compact />
                  </SubmitButton>
                </form>
              </Surface>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * The placement sheet for one place: what you own that fits here, and the
 * option to leave it empty. Rendered inline rather than in a modal so it
 * needs no client JavaScript and survives a page without it.
 */
async function AnchorEditor({
  userId,
  sceneId,
  anchorKey,
  anchorLabel,
  maxSize,
  standingName,
}: {
  userId: string;
  sceneId: string;
  anchorKey: string;
  anchorLabel: string;
  maxSize: string;
  standingName: string | null;
}) {
  const options = await listPlaceable(prisma, { userId, maxSize });

  return (
    <Surface id="place" className="mt-3" density="compact">
      <h3 className="font-display font-semibold">{anchorLabel}</h3>
      {standingName ? (
        <form action={clearAnchorAction} className="mt-2">
          <input type="hidden" name="sceneId" value={sceneId} />
          <input type="hidden" name="anchorKey" value={anchorKey} />
          <p className="text-sm text-text-muted">
            {standingName} is standing here.
          </p>
          <SubmitButton
            variant="destructiveQuiet"
            pendingLabel="Taking it away…"
            className="mt-2"
          >
            Take it away
          </SubmitButton>
        </form>
      ) : options.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">
          Nothing you own fits here yet.{" "}
          <TextLink href="/hollow/catalogue">
            Have a look at what&rsquo;s about
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
                  {option.name}
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
