import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getPublicProfile } from "@/server/modules/profiles/profile";
import { ItemArt } from "@/components/art/item-art";
import { PetArt } from "@/components/pet/pet-art";
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
  const profile = await getPublicProfile(prisma, username);
  return { title: profile ? `${profile.username}'s profile` : "Profile" };
}

export default async function PublicProfilePage({
  params,
}: PublicProfilePageProps) {
  const { username } = await params;
  const profile = await getPublicProfile(prisma, username);
  if (!profile) {
    notFound();
  }

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
            <TextLink href={`/shops/${profile.shop.slug}`} className="font-medium">
              Visit {profile.shop.name}
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
        <Surface as="section" raised aria-labelledby="companion-heading" className="mb-4">
          <SectionHeading id="companion-heading">Companion</SectionHeading>
          <div className="mt-3 flex items-center gap-4">
            <ArtworkFrame aspect="square" className="w-28 shrink-0 sm:w-32">
              <PetArt
                artKey={profile.featuredPet.artKey}
                label={`${profile.featuredPet.name}, a ${profile.featuredPet.speciesName}`}
              />
            </ArtworkFrame>
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {profile.featuredPet.name}
              </p>
              <p className="text-sm text-text-muted">
                {profile.featuredPet.speciesName} · Level{" "}
                {profile.featuredPet.level}
              </p>
            </div>
          </div>
        </Surface>
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
                <ArtworkFrame aspect="square" className="mx-auto w-full max-w-28">
                  <ItemArt
                    artKey={item.artKey}
                    categorySlug={item.categorySlug ?? undefined}
                    label=""
                  />
                </ArtworkFrame>
                <p className="mt-2 truncate text-sm font-medium" title={item.name}>
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
