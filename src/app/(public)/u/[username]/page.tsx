import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getPublicProfile } from "@/server/modules/profiles/profile";

/**
 * Shared between the page and its metadata. This is the app's only fully
 * public, unauthenticated page, and the lookup is four queries — running
 * it twice per request doubled the cost of the cheapest thing to hammer.
 */
const loadProfile = cache((username: string) =>
  getPublicProfile(prisma, username),
);
import { getPublicFondness } from "@/server/modules/pets/queries";
import { getPublicTrophyCase } from "@/server/modules/trophies/trophies";
import { getPublicShrine } from "@/server/modules/shrine/shrine";
import { TrophyCase } from "@/components/profile/trophy-case";
import { FondnessShelf } from "@/components/pet/fondness-shelf";
import { ItemArt } from "@/components/art/item-art";
import { PetArt, seasonsSince } from "@/components/pet/pet-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";

interface PublicProfilePageProps {
  params: Promise<{ username: string }>;
}

const JOIN_FORMAT = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
});

export async function generateMetadata({
  params,
}: PublicProfilePageProps): Promise<Metadata> {
  // Resolve the profile first: titles come from verified display names,
  // never echoed back from the raw route parameter.
  const { username } = await params;
  const profile = await loadProfile(username);
  return { title: profile ? `${profile.username}'s profile` : "Profile" };
}

export default async function PublicProfilePage({
  params,
}: PublicProfilePageProps) {
  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile) {
    notFound();
  }
  const [fondness, trophies, shrine] = await Promise.all([
    getPublicFondness(prisma, { username }),
    // Read-only: awarding happens when the owner looks at their own
    // profile, so an unauthenticated page load stays cheap (ADR-65).
    getPublicTrophyCase(prisma, { username }),
    getPublicShrine(prisma, { username }),
  ]);

  return (
    <>
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-text">
          {profile.username}
        </h1>
        {profile.title && (
          <p className="mt-1 text-sm font-medium text-accent-strong">
            {profile.title}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-muted">
          <span>Wandering since {JOIN_FORMAT.format(profile.joinedAt)}</span>
          {profile.shop && (
            <TextLink
              href={`/shops/${profile.shop.slug}`}
              className="font-medium"
            >
              Visit {profile.shop.name}
            </TextLink>
          )}
          {/* Offered unconditionally rather than only when furnished: a
              Hollow that is mostly empty is still somewhere they live, and
              hiding the link would quietly rank people by how much they
              have bought. */}
          <TextLink
            href={`/u/${profile.username}/hollow`}
            className="font-medium"
          >
            Visit their Hollow
          </TextLink>
          {/* Unlike the Hollow, this one IS conditional: an unpublished
              shrine has to be indistinguishable from no shrine, and a link
              that 404s is a way of telling strangers one exists. */}
          {shrine && (
            <TextLink
              href={`/u/${profile.username}/shrine`}
              className="font-medium"
            >
              See their shrine
            </TextLink>
          )}
        </div>
      </header>

      {profile.bio && (
        <Surface as="section" aria-label="About" className="mb-4">
          <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed text-text">
            {profile.bio}
          </p>
        </Surface>
      )}

      {profile.featuredPet && (
        <Surface
          as="section"
          raised
          aria-labelledby="companion-heading"
          className="mb-4"
        >
          <SectionHeading id="companion-heading">Companion</SectionHeading>
          <div className="mt-3 flex items-center gap-4">
            <ArtworkFrame aspect="square" className="w-28 shrink-0 sm:w-32">
              {/* Seasons only. How a stranger's companion is doing right
                  now is theirs, not a number for visitors to read off a
                  face — so mood stays at its neutral default here. */}
              <PetArt
                artKey={profile.featuredPet.artKey}
                label={`${profile.featuredPet.name}, a ${profile.featuredPet.speciesName}`}
                seasons={seasonsSince(profile.featuredPet.adoptedAt)}
              />
            </ArtworkFrame>
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {profile.featuredPet.name}
              </p>
              <p className="text-sm text-text-muted">
                {profile.featuredPet.speciesName}
              </p>
            </div>
          </div>
        </Surface>
      )}

      {/* What their companion turned out to love — the one thing on this
          page a visitor could not have bought. Renders nothing before the
          first discovery. */}
      <div className="mb-4">
        <FondnessShelf fondness={fondness} headingId="fondness-heading" />
      </div>

      {/* Only what they have earned. What somebody has NOT done is
          nobody else's business, so the case arrives with its unearned
          list already empty. Renders nothing until the first one. */}
      {trophies.earned.length > 0 && (
        <div className="mb-4">
          <TrophyCase
            earned={trophies.earned}
            unearned={trophies.unearned}
            ownerLabel={profile.username}
          />
        </div>
      )}

      <Surface as="section" raised aria-labelledby="display-heading">
        <SectionHeading id="display-heading">On display</SectionHeading>
        {profile.showcase.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="🏺"
              headingAs="h3"
              title="Nothing on display yet"
              description="Whatever this player chooses to show off will appear here."
            />
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {profile.showcase.map((item) => (
              <li
                key={item.itemId}
                className="rounded-surface border border-border bg-surface p-3 text-center"
              >
                <ArtworkFrame
                  aspect="square"
                  className="mx-auto w-full max-w-28"
                >
                  <ItemArt
                    artKey={item.artKey}
                    categorySlug={item.categorySlug ?? undefined}
                    label=""
                  />
                </ArtworkFrame>
                <p
                  className="mt-2 truncate text-sm font-medium"
                  title={item.name}
                >
                  {item.name}
                </p>
                {item.categoryName && (
                  <p className="text-xs text-text-muted">{item.categoryName}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </>
  );
}
