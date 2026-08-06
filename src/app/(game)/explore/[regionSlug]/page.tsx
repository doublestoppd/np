import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
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

export async function generateMetadata({
  params,
}: RegionPageProps): Promise<Metadata> {
  const { regionSlug } = await params;
  const region = await getPublishedRegion(prisma, regionSlug);
  return { title: region ? `${region.name} — Map` : "World Map" };
}

/**
 * Region map: illustrated with positioned markers on larger screens, and a
 * card list always — the mobile-first, marker-free fallback.
 */
export default async function RegionMapPage({ params }: RegionPageProps) {
  const { regionSlug } = await params;
  const region = await getPublishedRegion(prisma, regionSlug);
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
              mediaAspect="wide"
              media={<LocationArt artKey={location.artKey} label="" />}
              subtitle={
                location.npcShop?.active ? <Badge tone="accent">Shop</Badge> : undefined
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
