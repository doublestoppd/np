import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import {
  updateProfileAction,
  addShowcaseItemAction,
  removeShowcaseItemAction,
  moveShowcaseItemAction,
} from "@/server/actions/profile";
import {
  assetIsShowcaseable,
  listOwnedAssets,
} from "@/server/modules/items/ownership-view";
import { listShowcase, SHOWCASE_MAX } from "@/server/modules/profiles/showcase";
import { ItemArt } from "@/components/art/item-art";
import { PetArt } from "@/components/pet/pet-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { LinkButton, Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField, Input, Textarea } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { ItemIdentity } from "@/components/ui/item-identity";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { SELECTABLE_CARD_CLASSES } from "@/components/ui/selectable-card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { BIO_MAX, TITLE_MAX } from "@/lib/validation";

export const metadata: Metadata = { title: "Edit profile" };

export default async function ProfileEditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();

  const [profile, pets, showcase, inventory, params] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: user.id } }),
    prisma.pet.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" },
      include: { species: true },
    }),
    listShowcase(prisma, user.id),
    listOwnedAssets(prisma, user.id),
    searchParams,
  ]);

  const showcasedIds = new Set(showcase.map((entry) => entry.itemId));
  const addable = inventory
    .filter(assetIsShowcaseable)
    .filter((asset) => !showcasedIds.has(asset.item.id));
  const slotsLeft = SHOWCASE_MAX - showcase.length;

  return (
    <>
      <PageHeader
        title="Edit profile"
        description="What other wanderers see when they look you up."
        actions={
          <LinkButton href={`/u/${user.username}`} variant="secondary">
            View public profile
          </LinkButton>
        }
      />

      <FeedbackBanner
        notice={firstParam(params.notice)}
        error={firstParam(params.error)}
      />

      <Surface as="section" raised aria-labelledby="details-heading">
        <SectionHeading id="details-heading">Details</SectionHeading>
        <form action={updateProfileAction} className="mt-4 flex flex-col gap-4">
          <FormField
            label="Title"
            htmlFor="title"
            help={`A short line under your name. Up to ${TITLE_MAX} characters.`}
          >
            <Input
              id="title"
              name="title"
              type="text"
              maxLength={TITLE_MAX}
              defaultValue={profile?.title ?? ""}
              placeholder="Collector of unhurried mornings"
              aria-describedby="title-help"
            />
          </FormField>
          <FormField
            label="Bio"
            htmlFor="bio"
            help={`Plain text, up to ${BIO_MAX} characters.`}
          >
            <Textarea
              id="bio"
              name="bio"
              rows={4}
              maxLength={BIO_MAX}
              defaultValue={profile?.bio ?? ""}
              aria-describedby="bio-help"
            />
          </FormField>

          <fieldset>
            <legend className="text-sm font-medium text-text">
              Featured companion
            </legend>
            <p className="mt-1 text-xs text-text-muted">
              Shown at the top of your public profile.
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {pets.map((pet) => (
                <label
                  key={pet.id}
                  className={SELECTABLE_CARD_CLASSES}
                >
                  <input
                    type="radio"
                    name="featuredPetId"
                    value={pet.id}
                    defaultChecked={
                      profile?.featuredPetId
                        ? profile.featuredPetId === pet.id
                        : pets[0]?.id === pet.id
                    }
                    className="sr-only"
                  />
                  <PetArt
                    artKey={pet.species.artKey}
                    label=""
                    className="h-12 w-12 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {pet.name}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {pet.species.name}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
          </div>
        </form>
      </Surface>

      <Surface
        as="section"
        raised
        id="showcase"
        aria-labelledby="showcase-heading"
        className="mt-6 scroll-mt-4"
      >
        <SectionHeading id="showcase-heading">On display</SectionHeading>
        <p className="mt-1 text-sm text-text-muted">
          Up to {SHOWCASE_MAX} things you own, shown on your public profile in
          the order you choose. What they add up to is your business.
        </p>

        {showcase.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon="🖼️"
              headingAs="h3"
              title="Nothing on display yet"
              description="Add something you're carrying from the list below."
            />
          </div>
        ) : (
          <ol className="mt-4 flex flex-col gap-2">
            {showcase.map((entry, index) => (
              <Surface as="li" key={entry.itemId} density="compact">
                <div className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-text-muted">
                    {index + 1}
                  </span>
                  <ArtworkFrame aspect="square" className="w-12 shrink-0">
                    <ItemArt
                      artKey={entry.item.artKey}
                      categorySlug={entry.item.category?.slug}
                      label=""
                    />
                  </ArtworkFrame>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {entry.item.name}
                  </p>
                  <div className="flex shrink-0 gap-1">
                    <form action={moveShowcaseItemAction}>
                      <input type="hidden" name="itemId" value={entry.itemId} />
                      <input type="hidden" name="direction" value="up" />
                      <IconButton
                        type="submit"
                        disabled={index === 0}
                        label={`Move ${entry.item.name} earlier`}
                      >
                        ↑
                      </IconButton>
                    </form>
                    <form action={moveShowcaseItemAction}>
                      <input type="hidden" name="itemId" value={entry.itemId} />
                      <input type="hidden" name="direction" value="down" />
                      <IconButton
                        type="submit"
                        disabled={index === showcase.length - 1}
                        label={`Move ${entry.item.name} later`}
                      >
                        ↓
                      </IconButton>
                    </form>
                    <form action={removeShowcaseItemAction}>
                      <input type="hidden" name="itemId" value={entry.itemId} />
                      <Button
                        type="submit"
                        variant="destructiveQuiet"
                        aria-label={`Remove ${entry.item.name} from display`}
                      >
                        Remove
                      </Button>
                    </form>
                  </div>
                </div>
              </Surface>
            ))}
          </ol>
        )}

        <h3 className="mt-6 text-sm font-semibold text-text">
          Add from your things
          <span className="ml-2 font-normal text-text-muted">
            {slotsLeft} {slotsLeft === 1 ? "slot" : "slots"} free
          </span>
        </h3>
        {addable.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            Everything you own is already on display, or your satchel is empty.
          </p>
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {addable.map((asset) => (
              <ItemIdentity
                as="li"
                key={asset.kind === "stack" ? asset.item.id : asset.instanceId}
                size="sm"
                name={asset.item.name}
                art={
                  <ItemArt
                    artKey={asset.item.artKey}
                    categorySlug={asset.item.categorySlug ?? undefined}
                    label=""
                  />
                }
                meta={asset.kind === "instance" ? "One of a kind" : undefined}
                action={
                  <form action={addShowcaseItemAction}>
                    <input type="hidden" name="itemId" value={asset.item.id} />
                    {asset.kind === "instance" && (
                      <input
                        type="hidden"
                        name="itemInstanceId"
                        value={asset.instanceId}
                      />
                    )}
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={slotsLeft === 0}
                      aria-label={`Display ${asset.item.name}`}
                    >
                      Add
                    </Button>
                  </form>
                }
              />
            ))}
          </ul>
        )}
      </Surface>
    </>
  );
}
