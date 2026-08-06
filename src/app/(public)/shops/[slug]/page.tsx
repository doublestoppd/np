import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { getPublicShop } from "@/server/modules/commerce/player-shops/queries";
import { formatCoins } from "@/lib/money";
import { purchaseListingAction } from "@/server/actions/player-shop";
import { ItemArt } from "@/components/art/item-art";
import { Badge } from "@/components/ui/badge";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { ItemIdentity } from "@/components/ui/item-identity";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextLink } from "@/components/ui/text-link";
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
  const shopView = await getPublicShop(prisma, slug);
  if (!shopView) {
    notFound();
  }
  const { shop, listings } = shopView;

  const returnTo = `/shops/${shop.slug}`;
  const isOwner = viewer?.id === shop.owner.id;

  return (
    <>
      <PageHeader title={shop.name} description={shop.description || undefined} />
      <p className="-mt-2 mb-5 text-sm text-text-muted">
        Kept by{" "}
        <TextLink href={`/u/${shop.owner.username}`}>
          {shop.owner.username}
        </TextLink>
      </p>

      <FeedbackBanner
        notice={firstParam(queryParams.notice)}
        error={firstParam(queryParams.error)}
      />

      {listings.length === 0 ? (
        <EmptyState
          icon="🧺"
          title="The shelves are empty"
          description="Check back — shopkeepers restock on their own schedules."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {listings.map((listing) => (
            <ItemIdentity
              as="li"
              key={listing.id}
              headingAs="h2"
              name={listing.item.name}
              href={`/items/${listing.item.slug}`}
              rarity={listing.item.rarity}
              art={
                <ItemArt
                  artKey={listing.item.artKey}
                  categorySlug={listing.item.category?.slug}
                  label=""
                />
              }
              badges={
                listing.itemInstanceId ? (
                  <Badge tone="accent">One of a kind</Badge>
                ) : undefined
              }
              meta={`×${listing.quantity} available`}
              price={
                <>
                  <CurrencyAmount amount={listing.unitPrice} /> each
                </>
              }
              action={
                viewer && !isOwner ? (
                  <form action={purchaseListingAction}>
                    <input type="hidden" name="listingId" value={listing.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input
                      type="hidden"
                      name="expectedUnitPrice"
                      value={listing.unitPrice.toString()}
                    />
                    <IdempotencyField />
                    <SubmitButton pendingLabel="Buying…">
                      Buy —{" "}
                      {formatCoins(listing.unitPrice * BigInt(listing.quantity))}
                      <span className="sr-only"> coins total</span>
                    </SubmitButton>
                  </form>
                ) : !viewer ? (
                  <p className="text-xs text-text-muted">
                    <TextLink href="/sign-in">Sign in</TextLink> to buy.
                  </p>
                ) : undefined
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}
