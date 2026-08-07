import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getPublicProfile } from "@/server/modules/profiles/profile";
import { getPublicHollow } from "@/server/modules/hollow/queries";
import { HollowSceneArt } from "@/components/hollow/hollow-scene";
import { EmptyState } from "@/components/ui/empty-state";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";

/** Shared between the page and its metadata, like the profile it hangs off. */
const loadProfile = cache((username: string) =>
  getPublicProfile(prisma, username),
);

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = await loadProfile(username);
  return { title: profile ? `${profile.username}'s Hollow` : "A Hollow" };
}

/**
 * Somebody else's Hollow.
 *
 * A visitor sees the pictures, the captions, and nothing else. There is no
 * visit counter — not even for the owner, because the moment it is a
 * number people optimise it — no likes, no rating, no ranking, and no
 * directory of the best ones. A featured list is a competition wearing a
 * compliment's clothes.
 *
 * The admiration mechanism is simply that everything here is buyable by
 * anybody at a fixed price, forever: the reaction is "where did you get
 * that", and the answer is always the catalogue.
 */
export default async function PublicHollowPage({ params }: Props) {
  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile) {
    notFound();
  }
  const scenes = await getPublicHollow(prisma, { username });

  return (
    <>
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-text">
          {profile.username}&rsquo;s Hollow
        </h1>
        <p className="mt-1 text-sm">
          <TextLink href={`/u/${profile.username}`}>
            Back to their profile
          </TextLink>
        </p>
      </header>

      {scenes.length === 0 ? (
        <EmptyState
          icon="🌾"
          title="Nothing to see here yet"
          description="They haven't opened their Hollow."
        />
      ) : (
        scenes.map((scene) => (
          <Surface
            as="section"
            key={scene.id}
            raised
            className="mb-6"
            aria-labelledby={`scene-${scene.id}`}
          >
            <h2
              id={`scene-${scene.id}`}
              className="font-display text-lg font-semibold"
            >
              {scene.groundName}
            </h2>
            <p className="mt-1 text-sm text-text-muted">{scene.airName}</p>
            <div className="mt-3">
              <HollowSceneArt scene={scene} />
            </div>
            {scene.caption && (
              <p className="mt-3 text-sm text-text">{scene.caption}</p>
            )}
            {/* The same arrangement in words, for anyone who would rather
                read it — and the only place a visitor learns what things
                are called, which is how the "where did you get that"
                conversation starts. */}
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-muted">
              {scene.anchors
                .filter((anchor) => anchor.standing !== null)
                .map((anchor) => (
                  <li key={anchor.key}>{anchor.standing?.name}</li>
                ))}
            </ul>
          </Surface>
        ))
      )}
    </>
  );
}
