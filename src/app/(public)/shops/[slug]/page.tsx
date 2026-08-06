import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { purchaseListingAction } from "@/server/actions/commerce";
import { ItemArt } from "@/components/art/item-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { Badge } from "@/components/ui/badge";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { RarityBadge } from "@/components/ui/rarity-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { firstParam, type SearchParams } from "@/lib/search-params";

interface ShopPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({
  params,
}: ShopPageProps): Promise<Metadata> {
  const { slug } = await params;
  const shop = await prisma.playerShop.findUnique({ where: { slug } });
  return { title: shop ? shop.name : "Shop" };
}

/** Public player storefront: seller identity is always visible. */
export default async function PublicShopPage({
  params,
  searchParams,
}: ShopPageProps) {
  const { slug } = await params;
  const [viewer, queryParams] = await Promise.all([
    getCurrentUser(),
    searchParams,
  ]);
  const shop = await prisma.playerShop.findFirst({
    where: { slug, active: true },
    include: { owner: { select: { id: true, username: true } } },
  });
  if (!shop) {
    notFound();
  }

  const listings = await prisma.playerShopListing.findMany({
    where: { shopId: shop.id, status: "ACTIVE" },
    include: { item: { include: { category: true } } },
    orderBy: [{ unitPrice: "asc" }, { createdAt: "asc" }],
  });

  const returnTo = `/shops/${shop.slug}`;
  const isOwner = viewer?.id === shop.owner.id;

  return (
    <>
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-text">{shop.name}</h1>
        <p className="mt-1 text-sm text-text-muted">
          Kept by{" "}
          <Link
            href={`/u/${shop.owner.username}`}
            className="font-medium text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            {shop.owner.username}
          </Link>
        </p>
        {shop.description && (
          <p className="mt-2 max-w-prose text-sm text-text-muted">
            {shop.description}
          </p>
        )}
      </header>

      <FeedbackBanner
        notice={firstParam(queryParams.notice)}
        error={firstParam(queryParams.error)}
      />

      {listings.length === 0 ? (
        <Surface as="section">
          <p className="py-6 text-center text-sm text-text-muted">
            The shelves are empty. Check back — shopkeepers restock on their
            own schedules.
          </p>
        </Surface>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {listings.map((listing) => (
            <li
              key={listing.id}
              className="flex gap-3 rounded-surface border border-border bg-surface p-3"
            >
              <ArtworkFrame aspect="square" className="w-16 shrink-0 self-start">
                <ItemArt
                  artKey={listing.item.artKey}
                  categorySlug={listing.item.category?.slug}
                  label=""
                />
              </ArtworkFrame>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">
                    <Link
                      href={`/items/${listing.item.slug}`}
                      className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {listing.item.name}
                    </Link>
                  </h2>
                  <RarityBadge rarity={listing.item.rarity} />
                  {listing.itemInstanceId && (
                    <Badge tone="accent">One of a kind</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-sm tabular-nums text-text-muted">
                  ×{listing.quantity} · {listing.unitPrice}{" "}
                  {listing.unitPrice === 1 ? "coin" : "coins"} each
                </p>
                {viewer && !isOwner && (
                  <form action={purchaseListingAction} className="mt-2">
                    <input type="hidden" name="listingId" value={listing.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <IdempotencyField />
                    <SubmitButton pendingLabel="Buying…" className="min-h-9 px-3 py-1.5">
                      Buy — {listing.unitPrice * listing.quantity}
                      <span className="sr-only"> coins total</span>
                    </SubmitButton>
                  </form>
                )}
                {!viewer && (
                  <p className="mt-2 text-xs text-text-muted">
                    <Link
                      href="/sign-in"
                      className="text-accent underline underline-offset-2"
                    >
                      Sign in
                    </Link>{" "}
                    to buy.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
