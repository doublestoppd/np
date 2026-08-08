import { cache } from "react";
import type { Metadata } from "next";
import type { LocationActivityType } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getPublishedRegion } from "@/server/modules/world/world";
import { LocationArt } from "@/components/art/location-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { Badge } from "@/components/ui/badge";
import { ContentCard } from "@/components/ui/content-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

interface RegionPageProps {
  params: Promise<{ regionSlug: string }>;
}

/** Shared between the page and its metadata: one query per render. */
const loadRegion = cache((slug: string) => getPublishedRegion(prisma, slug));

export async function generateMetadata({
  params,
}: RegionPageProps): Promise<Metadata> {
  const { regionSlug } = await params;
  const region = await loadRegion(regionSlug);
  return { title: region ? `${region.name} — Map` : "World Map" };
}

/**
 * What a location offers, at a glance on the map. Short by design — the
 * card is a signpost, and the location page is where the detail lives.
 */
const ACTIVITY_LABELS: Record<LocationActivityType, string> = {
  NPC_SHOP: "Shop",
  DAILY_WORD: "Word puzzles",
  DAILY_WHEEL: "Prize wheel",
  DAILY_MEAL: "Free meal",
  REQUEST_BOARD: "Requests",
  FORAGING: "Foraging",
  SORTING_BENCH: "Sorting",
  LANTERN_HUNT: "Lantern",
  FISHING: "Fishing",
  DAILY_DRINK: "Free drink",
  MATCHING_GAME: "Matching",
  SLOT_MACHINE: "The drums",
  SUDOKU: "Slate",
  CAVE_DELVE: "The cave",
  PAPER_BIRD: "Paper bird",
  TREE_CLIMB: "Climbing",
  SNAKE: "Long grass",
  FORTUNE_ENGINE: "Fortune Engine",
  GIVEAWAY: "Free shelf",
};

/**
 * Region map: illustrated with positioned markers on larger screens, and a
 * card list always — the mobile-first, marker-free fallback.
 */
export default async function RegionMapPage({ params }: RegionPageProps) {
  // Authenticated here, not only by the group layout — see /explore.
  await requireUser();
  const { regionSlug } = await params;
  const region = await loadRegion(regionSlug);
  if (!region) {
    notFound();
  }

  const markers = region.locations.filter(
    (location) => location.mapX !== null && location.mapY !== null,
  );

  return (
    <>
      <PageHeader
        title={region.name}
        description={region.description}
        backHref="/explore"
        backLabel="Back to World Map"
      />

      {/* Illustrated map with markers, from md up. */}
      {markers.length > 0 && (
        <div className="relative mb-5 hidden md:block">
          <ArtworkFrame aspect="wide">
            <LocationArt artKey={region.artKey} label="" className="h-full w-full" />
          </ArtworkFrame>
          {markers.map((location) => (
            <Link
              key={location.id}
              href={`/explore/${region.slug}/${location.slug}`}
              className="absolute inline-flex min-h-9 -translate-x-1/2 -translate-y-1/2 items-center rounded-full border border-border-strong bg-surface-raised px-3 text-xs font-semibold text-text shadow-surface transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              style={{ left: `${location.mapX}%`, top: `${location.mapY}%` }}
            >
              {location.name}
            </Link>
          ))}
        </div>
      )}

      {region.locations.length === 0 ? (
        <EmptyState
          icon="🗺️"
          title="Nothing charted here yet"
          description="This corner of the world is still being painted in. Check back soon."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {region.locations.map((location) => (
            <ContentCard
              key={location.id}
              as="li"
              title={location.name}
              href={`/explore/${region.slug}/${location.slug}`}
              // The badges below say what is here, but they sit outside
              // the link, so tabbing the map gave a list of bare place
              // names and no clue which of them did anything.
              linkLabel={
                location.activities.length > 0
                  ? `${location.name} — ${location.activities
                      .map((activity) => ACTIVITY_LABELS[activity.type])
                      .join(", ")}`
                  : undefined
              }
              mediaAspect="wide"
              media={<LocationArt artKey={location.artKey} label="" />}
              subtitle={
                location.activities.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {location.activities.map((activity) => (
                      <Badge key={activity.type} tone="accent">
                        {ACTIVITY_LABELS[activity.type]}
                      </Badge>
                    ))}
                  </span>
                ) : undefined
              }
            >
              <span className="line-clamp-2">{location.description}</span>
            </ContentCard>
          ))}
        </ul>
      )}
    </>
  );
}
