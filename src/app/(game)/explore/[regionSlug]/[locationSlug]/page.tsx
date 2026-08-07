import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getPublishedLocation } from "@/server/modules/world/world";

/** Shared between the page and its metadata: one lookup per render. */
const loadLocation = cache((regionSlug: string, locationSlug: string) =>
  getPublishedLocation(prisma, regionSlug, locationSlug),
);
import { LocationArt } from "@/components/art/location-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageHeader } from "@/components/ui/page-header";
import { renderLocationActivity } from "@/components/location-activities/registry";
import type { LocationPageContext } from "@/components/location-activities/types";
import { firstParam, type SearchParams } from "@/lib/search-params";

interface LocationPageProps {
  params: Promise<{ regionSlug: string; locationSlug: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({
  params,
}: LocationPageProps): Promise<Metadata> {
  const { regionSlug, locationSlug } = await params;
  const location = await loadLocation(regionSlug, locationSlug);
  return { title: location ? location.name : "Explore" };
}

/**
 * A location page: hero, title, region context, flavor text, then each
 * attached activity in authored display order.
 *
 * This route contains no feature-specific logic — no slug comparisons, no
 * knowledge of what a shop or a daily is. It loads the location and its
 * attachments and hands each one to the typed registry, which isolates
 * failures per activity.
 */
export default async function LocationPage({
  params,
  searchParams,
}: LocationPageProps) {
  const user = await requireUser();
  const { regionSlug, locationSlug } = await params;
  const [location, queryParams] = await Promise.all([
    loadLocation(regionSlug, locationSlug),
    searchParams,
  ]);
  if (!location) {
    notFound();
  }

  const context: LocationPageContext = {
    id: location.id,
    slug: location.slug,
    name: location.name,
    regionSlug: location.region.slug,
    regionName: location.region.name,
    path: `/explore/${regionSlug}/${locationSlug}`,
  };
  const viewer = {
    id: user.id,
    username: user.username,
    coins: user.coins,
  };

  const sections = await Promise.all(
    location.activities.map(async (attachment) => ({
      id: attachment.id,
      node: await renderLocationActivity({ attachment, location: context, viewer }),
    })),
  );

  return (
    <>
      {/* Mood first, then identity, then whatever there is to do here. */}
      <ArtworkFrame aspect="wide" focal="center" className="mb-4 max-h-56 md:max-h-72">
        <LocationArt artKey={location.artKey} label="" />
      </ArtworkFrame>

      <PageHeader
        title={location.name}
        backHref={`/explore/${location.region.slug}`}
        backLabel={`Back to ${location.region.name}`}
      />

      <p className="-mt-1 mb-4 max-w-prose text-sm leading-relaxed text-text">
        {location.description}
      </p>

      <FeedbackBanner
        notice={firstParam(queryParams.notice)}
        error={firstParam(queryParams.error)}
      />

      {sections.length === 0 ? (
        <EmptyState
          icon="🌫️"
          title="More to discover later"
          description="There is more here than meets the eye. It is not, for the moment, meeting the eye."
        />
      ) : (
        sections.map((section) => (
          <div key={section.id}>{section.node}</div>
        ))
      )}
    </>
  );
}
