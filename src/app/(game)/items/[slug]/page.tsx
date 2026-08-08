import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { PLAYER_VISIBLE_LIFECYCLES } from "@/server/modules/items/lifecycle";
import { requireUser } from "@/server/auth/session";
import {
  getPublicShop,
  listingsForItem,
} from "@/server/modules/commerce/player-shops/queries";
import {
  provenanceByInstance,
  type ProvenanceEventView,
} from "@/server/modules/items/provenance";
import { itemSources } from "@/server/modules/items/sources";
import { coinsToJSON, formatCoins } from "@/lib/money";
import { describeItemUse } from "@/lib/pet-condition";
import {
  describeAcquisition,
  describeProvenanceEvent,
} from "@/lib/provenance-copy";
import { purchaseListingAction } from "@/server/actions/player-shop";
import { ItemArt } from "@/components/art/item-art";
import { PurchaseDialog } from "@/components/commerce/purchase-dialog";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { Badge } from "@/components/ui/badge";
import { TagBadge } from "@/components/ui/tag-badge";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { PageHeader } from "@/components/ui/page-header";
import { RarityBadge } from "@/components/ui/rarity-badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { getScratchCardView } from "@/server/modules/scratch/queries";
import { getSlotTokenView } from "@/server/modules/slots/queries";
import { ScratchPrizeLadder } from "@/components/scratch/scratch-prize-ladder";
import { SlotPrizeLadder } from "@/components/games/slot-prize-ladder";
import { TextLink } from "@/components/ui/text-link";
import { firstParam, type SearchParams } from "@/lib/search-params";

interface ItemPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

/**
 * One visibility predicate for the page and its metadata. Looking a slug up
 * without it leaked the existence and name of DRAFT and DISABLED items
 * through the document title while the page itself 404'd — the tab said
 * what the body refused to. `cache` keeps the shared lookup to one query
 * per render.
 */
const loadVisibleItem = cache(async (slug: string) =>
  prisma.item.findFirst({
    where: { slug, lifecycle: { in: PLAYER_VISIBLE_LIFECYCLES } },
    include: { category: true, tags: true },
  }),
);

export async function generateMetadata({
  params,
}: ItemPageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = await loadVisibleItem(slug);
  return { title: item ? item.name : "Item" };
}

const DATE_FORMAT = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/**
 * Where "Back" goes. Item pages are reached from several surfaces, so the
 * origin travels in a `from` param; an unrecognized or absent value means
 * no back link at all rather than a link that lies about where you were.
 */
const ORIGINS: Record<string, { href: string; label: string }> = {
  inventory: { href: "/inventory", label: "Back to Satchel" },
  market: { href: "/market", label: "Back to Market" },
  shop: { href: "/shop", label: "Back to your shop" },
  home: { href: "/", label: "Back to Home" },
};

/**
 * A location origin, e.g. `explore:dapplewood:toadstool-hollow`. Shelves
 * live at locations, so "back" from an item has to name which one — a bare
 * `explore` would land the player on the world map, several taps from the
 * shop they were reading.
 *
 * Both segments are matched against the slug alphabet before they are
 * interpolated, so nothing a caller puts in the URL can escape the
 * `/explore/` prefix.
 */
const LOCATION_ORIGIN = /^explore:([a-z0-9-]{1,64}):([a-z0-9-]{1,64})$/;

/** A public player storefront, e.g. `shops:mossbell-sundries`. */
const SHOP_ORIGIN = /^shops:([a-z0-9-]{1,64})$/;

async function resolveOrigin(
  from: string | undefined,
): Promise<{ href: string; label: string } | undefined> {
  if (!from) return undefined;
  const known = ORIGINS[from];
  if (known) return known;
  const shop = SHOP_ORIGIN.exec(from);
  if (shop) {
    const storefront = await getPublicShop(prisma, shop[1]!);
    return storefront
      ? { href: `/shops/${shop[1]}`, label: `Back to ${storefront.shop.name}` }
      : undefined;
  }

  const match = LOCATION_ORIGIN.exec(from);
  if (!match) return undefined;
  const [, regionSlug, locationSlug] = match;
  // Named, not "← Back": every other back link in the app says where it
  // goes, and a location's name is the only place to get it from.
  const location = await prisma.location.findFirst({
    where: {
      slug: locationSlug,
      published: true,
      region: { slug: regionSlug, published: true },
    },
    select: { name: true },
  });
  if (!location) return undefined;
  return {
    href: `/explore/${regionSlug}/${locationSlug}`,
    label: `Back to ${location.name}`,
  };
}

export default async function ItemDetailPage({
  params,
  searchParams,
}: ItemPageProps) {
  const user = await requireUser();
  const { slug } = await params;
  const [item, queryParams] = await Promise.all([
    loadVisibleItem(slug),
    searchParams,
  ]);
  if (!item) {
    notFound();
  }

  // A chit's prize ladder belongs on its own page, not only inside the
  // dialog: somebody deciding whether to walk to the stall should see what
  // is on it. What they do not see is how often (ADR-48).
  const odds = await getScratchCardView(prisma, { itemId: item.id });
  // And the same for a token, which had this written and never called.
  const drum = await getSlotTokenView(prisma, { itemId: item.id });

  const [ownedEntry, ownedInstances, listings, sources] = await Promise.all([
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
          .then(async (instances) => {
            // One query for every copy's history, not one per copy: a
            // player can own 100 of a provenance-bearing definition, and
            // this is an unrated GET.
            const byInstance =
              item.provenancePolicy === "NONE"
                ? new Map<string, ProvenanceEventView[]>()
                : await provenanceByInstance(
                    prisma,
                    instances.map((instance) => instance.id),
                  );
            return instances.map((instance) => ({
              instance,
              events: byInstance.get(instance.id) ?? [],
            }));
          }),
    item.tradeable ? listingsForItem(prisma, item.id) : Promise.resolve([]),
    itemSources(prisma, { itemId: item.id }),
  ]);

  const returnTo = `/items/${item.slug}`;
  const origin = await resolveOrigin(firstParam(queryParams.from));

  return (
    <>
      <PageHeader
        title={item.name}
        backHref={origin?.href}
        backLabel={origin?.label}
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
                <TagBadge key={tag.id} slug={tag.slug} name={tag.name} />
              ))}
              {!item.tradeable && <Badge tone="danger">Not tradeable</Badge>}
              {!item.stackable && <Badge tone="accent">One of a kind</Badge>}
            </div>
            <p className="mt-3 max-w-prose text-sm text-text-muted">
              {item.description}
            </p>
            {describeItemUse(item) && (
              <p className="mt-2 text-sm text-text">{describeItemUse(item)}</p>
            )}
            <p className="mt-2 text-sm text-text-muted">
              Estimated value: <CurrencyAmount amount={item.price} />
            </p>
          </div>
        </div>
      </Surface>

      {odds && (
        <Surface as="section" aria-labelledby="odds-heading" className="mt-4">
          <SectionHeading id="odds-heading">
            What&apos;s under the salt
          </SectionHeading>
          <ScratchPrizeLadder
            priceJson={odds.priceJson}
            prizes={odds.prizes}
            jackpotJson={odds.jackpot.standsAt}
            lastWonBy={odds.jackpot.lastWonBy}
          />
        </Surface>
      )}

      {drum && (
        <Surface as="section" aria-labelledby="drum-heading" className="mt-4">
          <SectionHeading id="drum-heading">
            What&apos;s on this drum
          </SectionHeading>
          <SlotPrizeLadder
            priceJson={drum.priceJson}
            faces={drum.faces}
            prizes={drum.prizes}
          />
        </Surface>
      )}

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
                    {describeAcquisition(instance.acquisitionSource)}
                  </p>
                  {events.length > 0 && (
                    <ul className="mt-1 text-xs text-text-muted">
                      {events.map((event) => (
                        <li key={event.id}>
                          {DATE_FORMAT.format(event.at)} —{" "}
                          {describeProvenanceEvent(event)}
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

      {/* Where it comes from.
          A playtest walked into the dead end this closes: a request board
          asked for two Honey-Oat Biscuits, and this page said the player
          owned none and nobody was selling any — which reads as
          "unobtainable" rather than "try a shop". Places only, never
          probabilities (see the module's note). Rendered above the player
          market because a shop that stocks it is the answer a player who
          owns none actually needs. */}
      {sources.length > 0 && (
        <Surface as="section" aria-labelledby="sources-heading" className="mt-4">
          <SectionHeading id="sources-heading">Where to find it</SectionHeading>
          <ul className="mt-2 flex flex-col gap-2">
            {sources.map((source, index) => (
              <li
                key={`${source.kind}-${source.name}-${index}`}
                className="rounded-control border border-border bg-background px-3 py-2 text-sm"
              >
                <Badge>{source.kind}</Badge>{" "}
                {source.href ? (
                  <TextLink href={source.href}>{source.name}</TextLink>
                ) : (
                  <span className="font-medium">{source.name}</span>
                )}{" "}
                {source.detail}
                {source.locationName && source.locationName !== source.name && (
                  <span className="block text-xs text-text-muted">
                    {source.locationName}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Surface>
      )}

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
                  {listing.sellerId !== user.id &&
                    (listing.quantity > 1 ? (
                      <PurchaseDialog
                        action={purchaseListingAction}
                        hiddenFields={{
                          listingId: listing.id,
                          returnTo,
                          expectedUnitPrice: listing.unitPrice.toString(),
                        }}
                        available={listing.quantity}
                        maxPerPurchase={listing.quantity}
                        balanceJson={coinsToJSON(user.coins)}
                        seller={listing.seller.username}
                        item={{
                          name: item.name,
                          slug: item.slug,
                          description: item.description,
                          categoryName: item.category?.name ?? null,
                          useSummary: describeItemUse(item),
                          priceJson: coinsToJSON(listing.unitPrice),
                          tradeable: item.tradeable,
                          stackable: item.stackable,
                        }}
                        art={
                          <ArtworkFrame aspect="square">
                            <ItemArt
                              artKey={item.artKey}
                              categorySlug={item.category?.slug}
                              label=""
                            />
                          </ArtworkFrame>
                        }
                        badges={
                          <>
                            <RarityBadge rarity={item.rarity} />
                            {item.category && <Badge>{item.category.name}</Badge>}
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
                    ))}
                </li>
              ))}
            </ul>
          )}
        </Surface>
      )}
    </>
  );
}
