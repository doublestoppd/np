import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getPublishedLocation } from "@/server/services/world";
import { LocationArt } from "@/components/art/location-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";

interface LocationPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: LocationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const location = await getPublishedLocation(prisma, slug);
  return { title: location ? location.name : "Explore" };
}

export default async function LocationPage({ params }: LocationPageProps) {
  const { slug } = await params;
  const location = await getPublishedLocation(prisma, slug);
  if (!location) {
    notFound();
  }

  return (
    <>
      <ArtworkFrame aspect="wide" className="mb-4">
        <LocationArt artKey={location.artKey} label={location.name} />
      </ArtworkFrame>

      <PageHeader
        title={location.name}
        description={`${location.region.name}`}
      />

      <Surface as="section">
        <p className="max-w-prose text-sm leading-relaxed text-text">
          {location.description}
        </p>
      </Surface>

      <Surface as="section" className="mt-4">
        <h2 className="font-display text-base font-semibold">
          More to discover later
        </h2>
        <p className="mt-1 max-w-prose text-sm text-text-muted">
          There is more here than meets the eye. It is not, for the moment,
          meeting the eye.
        </p>
      </Surface>

      <div className="mt-6">
        <LinkButton href="/explore" variant="secondary">
          Back to Explore
        </LinkButton>
      </div>
    </>
  );
}
