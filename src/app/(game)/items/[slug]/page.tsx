import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { listingsForItem } from "@/server/modules/commerce/player-shops/queries";
import { listProvenance } from "@/server/modules/items/provenance";
import { formatCoins } from "@/lib/money";
import { purchaseListingAction } from "@/server/actions/player-shop";
import { ItemArt } from "@/components/art/item-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { Badge } from "@/components/ui/badge";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { PageHeader } from "@/components/ui/page-header";
import { RarityBadge } from "@/components/ui/rarity-badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";
import { firstParam, type SearchParams } from "@/lib/search-params";

interface ItemPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({
  params,
}: ItemPageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = await prisma.item.findUnique({ where: { slug } });
  return { title: item ? item.name : "Item" };
}

const DATE_FORMAT = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function ItemDetailPage({
  params,
  searchParams,
}: ItemPageProps) {
  const user = await requireUser();
  const { slug } = await params;
  const [item, queryParams] = await Promise.all([
    prisma.item.findFirst({
      where: { slug, lifecycle: { in: ["ACTIVE", "RETIRED"] } },
      include: { category: true, tags: true },
    }),
    searchParams,
  ]);
  if (!item) {
    notFound();
  }

  const [ownedEntry, ownedInstances, listings] = await Promise.all([
    prisma.inventoryEntry.findUnique({
      where: { userId_itemId: { userId: user.id, itemId: item.id } },
    }),
    item.stackable
      ? Promise.resolve([])
      : prisma.itemInstance
          .findMany({
            where: { itemId: item.id, ownerId: user.id },
            orderBy: { acquiredAt: "asc" },
            take: 100,
          })
          .then((instances) =>
            Promise.all(
              instances.map(async (instance) => ({
                instance,
                events:
                  item.provenancePolicy === "NONE"
                    ? []
                    : (await listProvenance(prisma, instance.id)).events,
              })),
            ),
          ),
    item.tradeable ? listingsForItem(prisma, item.id) : Promise.resolve([]),
  ]);

  const returnTo = `/items/${item.slug}`;

  return (
    <>
      <PageHeader
        title={item.name}
        backHref="/market"
        backLabel="Back to Market"
      />

      <FeedbackBanner
        notice={firstParam(queryParams.notice)}
        error={firstParam(queryParams.error)}
      />

      {/* Artwork is a dominant element of the detail page. */}
      <Surface as="section" raised>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <ArtworkFrame aspect="square" className="w-44 shrink-0 sm:w-52">
            <ItemArt
              artKey={item.artKey}
              categorySlug={item.category?.slug}
              label={item.name}
            />
          </ArtworkFrame>
          <div className="w-full text-center sm:text-left">
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <RarityBadge rarity={item.rarity} />
              {item.category && <Badge>{item.category.name}</Badge>}
              {item.tags.map((tag) => (
                <Badge key={tag.id}>{tag.name}</Badge>
              ))}
              {!item.tradeable && <Badge tone="danger">Not tradeable</Badge>}
              {!item.stackable && <Badge tone="accent">One of a kind</Badge>}
            </div>
            <p className="mt-3 max-w-prose text-sm text-text-muted">
              {item.description}
            </p>
            <p className="mt-2 text-sm text-text-muted">
              Estimated value: <CurrencyAmount amount={item.price} />
            </p>
          </div>
        </div>
      </Surface>

      <Surface as="section" aria-labelledby="owned-heading" className="mt-4">
        <SectionHeading id="owned-heading">Yours</SectionHeading>
        {item.stackable ? (
          <p className="mt-1 text-sm text-text-muted">
            {ownedEntry && ownedEntry.quantity > 0
              ? `You’re carrying ×${ownedEntry.quantity}.`
              : "You don’t own any of these yet."}
          </p>
        ) : ownedInstances.length === 0 ? (
          <p className="mt-1 text-sm text-text-muted">
            You don’t own one of these yet.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {ownedInstances.map(({ instance, events }, index) => {
              return (
                <li
                  key={instance.id}
                  className="rounded-control border border-border bg-background px-3 py-2 text-sm"
                >
                  <p className="font-medium">
                    Copy #{index + 1}
                    {instance.status === "ESCROWED" && (
                      <Badge tone="warning" className="ml-2">
                        Listed in your shop
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-text-muted">
                    Acquired {DATE_FORMAT.format(instance.acquiredAt)} ·{" "}
                    {instance.acquisitionSource}
                  </p>
                  {events.length > 0 && (
                    <ul className="mt-1 text-xs text-text-muted">
                      {events.map((event) => (
                        <li key={event.id}>
                          {DATE_FORMAT.format(event.at)} — {event.note}
                          {event.toUsername ? ` (to ${event.toUsername})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Surface>

      {item.tradeable && (
        <Surface as="section" aria-labelledby="listings-heading" className="mt-4">
          <SectionHeading id="listings-heading">
            For sale by players
          </SectionHeading>
          {listings.length === 0 ? (
            <p className="mt-1 text-sm text-text-muted">
              Nobody is selling this right now.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {listings.map((listing) => (
                <li
                  key={listing.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      ×{listing.quantity} ·{" "}
                      <CurrencyAmount amount={listing.unitPrice} /> each
                    </p>
                    <p className="text-xs text-text-muted">
                      Sold by{" "}
                      <TextLink href={`/shops/${listing.shop.slug}`}>
                        {listing.seller.username}
                      </TextLink>
                    </p>
                  </div>
                  {listing.sellerId !== user.id && (
                    <form action={purchaseListingAction}>
                      <input type="hidden" name="listingId" value={listing.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <IdempotencyField />
                      <SubmitButton pendingLabel="Buying…">
                        Buy —{" "}
                        {formatCoins(listing.unitPrice * BigInt(listing.quantity))}
                        <span className="sr-only"> coins total</span>
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Surface>
      )}
    </>
  );
}
