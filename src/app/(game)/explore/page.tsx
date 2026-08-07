import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getExploreRegions } from "@/server/modules/world/world";
import { LocationArt } from "@/components/art/location-art";
import { ContentCard } from "@/components/ui/content-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "World Map" };

/** World map: the top of the World -> Region -> Location hierarchy. */
export default async function WorldMapPage() {
  // Every other page in this group authenticates itself. A layout is not a
  // reliable place for the sole check, and this page's query would run
  // regardless of the layout's redirect.
  await requireUser();
  const regions = await getExploreRegions(prisma);

  return (
    <>
      <PageHeader
        title="World Map"
        description="The world is larger than the map admits. Pick a region to wander."
      />

      {regions.length === 0 ? (
        <EmptyState
          icon="🧭"
          title="The paths are still being cleared"
          description="New regions to wander will open here soon."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {regions.map((region) => (
            <ContentCard
              key={region.id}
              as="li"
              title={region.name}
              href={`/explore/${region.slug}`}
              mediaAspect="wide"
              media={<LocationArt artKey={region.artKey} label={region.name} />}
              subtitle={`${region.locations.length} ${
                region.locations.length === 1 ? "place" : "places"
              } to visit`}
            >
              <span className="line-clamp-2">{region.description}</span>
            </ContentCard>
          ))}
        </ul>
      )}
    </>
  );
}
