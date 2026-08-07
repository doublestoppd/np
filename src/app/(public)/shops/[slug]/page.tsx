import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { getPublicShop } from "@/server/modules/commerce/player-shops/queries";
import { coinsToJSON, formatCoins } from "@/lib/money";
import { describeItemUse } from "@/lib/pet-condition";
import { purchaseListingAction } from "@/server/actions/player-shop";
import { ItemArt } from "@/components/art/item-art";
import { PurchaseDialog } from "@/components/commerce/purchase-dialog";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { RarityBadge } from "@/components/ui/rarity-badge";
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

/**
 * Same predicate for the page and its metadata: `getPublicShop` already
 * excludes closed shops and deactivated owners, and the title must not
 * announce a storefront the page refuses to show. `cache` keeps the shared
 * lookup to one query per render.
 */
const loadPublicShop = cache((slug: string) => getPublicShop(prisma, slug));

export async function generateMetadata({
  params,
}: ShopPageProps): Promise<Metadata> {
  const { slug } = await params;
  const view = await loadPublicShop(slug);
  return { title: view ? view.shop.name : "Shop" };
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
  const shopView = await loadPublicShop(slug);
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
              href={`/items/${listing.item.slug}?from=shops:${slug}`}
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
              // "each" is dropped in the inline layout: it pushed the Buy
              // button past the ~164px text column at 360px and wrapped it
              // under the price. The quantity is already in the meta line.
              price={<CurrencyAmount amount={listing.unitPrice} />}
              actionPlacement="inline"
              action={
                viewer && !isOwner ? (
                  listing.quantity > 1 ? (
                    // More than one on offer is a question, so it gets a
                    // dialog. A single unit is not a question.
                    <PurchaseDialog
                      action={purchaseListingAction}
                      hiddenFields={{
                        listingId: listing.id,
                        returnTo,
                        expectedUnitPrice: listing.unitPrice.toString(),
                      }}
                      available={listing.quantity}
                      maxPerPurchase={listing.quantity}
                      balanceJson={coinsToJSON(viewer.coins)}
                      seller={shop.owner.username}
                      item={{
                        name: listing.item.name,
                        slug: listing.item.slug,
                        description: listing.item.description,
                        categoryName: listing.item.category?.name ?? null,
                        useSummary: describeItemUse(listing.item),
                        priceJson: coinsToJSON(listing.unitPrice),
                        tradeable: listing.item.tradeable,
                        stackable: listing.item.stackable,
                      }}
                      art={
                        <ArtworkFrame aspect="square">
                          <ItemArt
                            artKey={listing.item.artKey}
                            categorySlug={listing.item.category?.slug}
                            label=""
                          />
                        </ArtworkFrame>
                      }
                      badges={
                        <>
                          <RarityBadge rarity={listing.item.rarity} />
                          {listing.item.category && (
                            <Badge>{listing.item.category.name}</Badge>
                          )}
                          {listing.itemInstanceId && (
                            <Badge tone="accent">One of a kind</Badge>
                          )}
                        </>
                      }
                    />
                  ) : (
                    <form action={purchaseListingAction}>
                      <input type="hidden" name="listingId" value={listing.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input type="hidden" name="quantity" value="1" />
                      <input
                        type="hidden"
                        name="expectedUnitPrice"
                        value={listing.unitPrice.toString()}
                      />
                      <IdempotencyField />
                      <SubmitButton pendingLabel="Buying…">
                        Buy — {formatCoins(listing.unitPrice)}
                        <span className="sr-only"> coins</span>
                      </SubmitButton>
                    </form>
                  )
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
