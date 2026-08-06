import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { getExploreRegions } from "@/server/services/world";
import { LocationArt } from "@/components/art/location-art";
import { ContentCard } from "@/components/ui/content-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Explore" };

export default async function ExplorePage() {
  const regions = await getExploreRegions(prisma);

  return (
    <>
      <PageHeader
        title="Explore"
        description="The world is larger than the map admits. Start anywhere."
      />

      {regions.length === 0 ? (
        <EmptyState
          icon="🧭"
          title="The paths are still being cleared"
          description="New places to wander will open here soon."
        />
      ) : (
        regions.map((region) => (
          <section
            key={region.id}
            aria-labelledby={`region-${region.slug}`}
            className="mt-2"
          >
            <h2
              id={`region-${region.slug}`}
              className="font-display text-lg font-semibold"
            >
              {region.name}
            </h2>
            <p className="mt-1 max-w-prose text-sm text-text-muted">
              {region.description}
            </p>
            {region.locations.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">
                No paths open here yet.
              </p>
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {region.locations.map((location) => (
                  <ContentCard
                    key={location.id}
                    as="li"
                    title={location.name}
                    href={`/explore/${location.slug}`}
                    mediaAspect="wide"
                    media={
                      <LocationArt
                        artKey={location.artKey}
                        label={location.name}
                      />
                    }
                  >
                    <span className="line-clamp-2">{location.description}</span>
                  </ContentCard>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </>
  );
}
