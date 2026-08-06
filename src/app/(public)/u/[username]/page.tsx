import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getPublicProfile } from "@/server/services/profile";
import { ItemArt } from "@/components/art/item-art";
import { PetArt } from "@/components/pet/pet-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/ui/surface";

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
  const { username } = await params;
  return { title: `${username}'s profile` };
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
          <Badge tone="accent">
            <span aria-hidden="true">🪙</span> {profile.coins} coins
          </Badge>
          {profile.shop && (
            <Link
              href={`/shops/${profile.shop.slug}`}
              className="font-medium text-accent underline underline-offset-2 hover:text-accent-strong"
            >
              Visit {profile.shop.name}
            </Link>
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
          <h2
            id="companion-heading"
            className="font-display text-lg font-semibold"
          >
            Companion
          </h2>
          <div className="mt-3 flex items-center gap-4">
            <ArtworkFrame aspect="square" className="w-24 shrink-0">
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
        <h2 id="display-heading" className="font-display text-lg font-semibold">
          On display
        </h2>
        {profile.showcase.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            Nothing on display yet.
          </p>
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
