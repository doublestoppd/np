import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { ensurePlayerShop } from "@/server/modules/commerce/player-shops/commands/shop";
import { getOwnerDashboard } from "@/server/modules/commerce/player-shops/queries";
import {
  assetIsListable,
  listOwnedAssets,
} from "@/server/modules/items/ownership-view";
import { coinLabel, formatCoins } from "@/lib/money";
import {
  cancelListingAction,
  claimProceedsAction,
  createListingAction,
  purchaseUpgradeAction,
  updateListingPriceAction,
  updateShopDetailsAction,
} from "@/server/actions/player-shop";
import { ItemArt } from "@/components/art/item-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField, Input, Select } from "@/components/ui/field";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { SHOP_DESCRIPTION_MAX, SHOP_NAME_MAX } from "@/lib/validation";

export const metadata: Metadata = { title: "Your shop" };

const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function ShopDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const shop = await ensurePlayerShop(prisma, user.id);

  const [params, dashboard, ownedAssets, tiers, ownedTierRows] =
    await Promise.all([
      searchParams,
      getOwnerDashboard(prisma, shop.id),
      listOwnedAssets(prisma, user.id),
      prisma.playerShopUpgradeTier.findMany({
        where: { active: true },
        orderBy: { tier: "asc" },
      }),
      prisma.playerShopUpgradePurchase.findMany({
        where: { shopId: shop.id },
        select: { tier: { select: { tier: true } } },
      }),
    ]);
  const { listings, sales } = dashboard;

  const ownedTiers = new Set(ownedTierRows.map((row) => row.tier.tier));
  const nextTier = tiers.find((tier) => !ownedTiers.has(tier.tier));
  const listable = ownedAssets.filter(assetIsListable);
  const listableStacks = listable.filter((asset) => asset.kind === "stack");
  const instances = listable.filter((asset) => asset.kind === "instance");
  const capacityUsed = listings.length;

  return (
    <>
      <PageHeader
        title="Your shop"
        description="One stall, your rules. Fixed prices, no fees, no tax."
        actions={
          <LinkButton href={`/shops/${shop.slug}`} variant="secondary">
            View public page
          </LinkButton>
        }
      />

      <FeedbackBanner
        notice={firstParam(params.notice)}
        error={firstParam(params.error)}
      />

      {/* Till */}
      <Surface as="section" raised aria-labelledby="till-heading">
        <h2 id="till-heading" className="font-display text-lg font-semibold">
          Shop till
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-text-muted">Unclaimed proceeds</dt>
            <dd className="text-lg font-bold tabular-nums">
              {formatCoins(shop.unclaimedProceeds)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Wallet</dt>
            <dd className="text-lg font-bold tabular-nums">
              {formatCoins(user.coins)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Lifetime revenue</dt>
            <dd className="text-lg font-bold tabular-nums">
              {formatCoins(shop.lifetimeRevenue)}
            </dd>
          </div>
        </dl>
        <form action={claimProceedsAction} className="mt-3">
          <IdempotencyField />
          <SubmitButton
            pendingLabel="Claiming…"
            disabled={shop.unclaimedProceeds === 0n}
          >
            Claim {formatCoins(shop.unclaimedProceeds)} coins
          </SubmitButton>
        </form>
      </Surface>

      {/* Active listings */}
      <Surface as="section" raised aria-labelledby="listings-heading" className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="listings-heading" className="font-display text-lg font-semibold">
            On the shelves
          </h2>
          <Badge tone={capacityUsed >= shop.listingCapacity ? "warning" : "neutral"}>
            {capacityUsed}/{shop.listingCapacity} slots used
          </Badge>
        </div>
        {listings.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="🧺"
              title="Nothing for sale yet"
              description="List something from your satchel below."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {listings.map((listing) => (
              <li
                key={listing.id}
                className="flex flex-wrap items-center gap-3 rounded-surface border border-border bg-surface p-3"
              >
                <ArtworkFrame aspect="square" className="w-12 shrink-0">
                  <ItemArt
                    artKey={listing.item.artKey}
                    categorySlug={listing.item.category?.slug}
                    label=""
                  />
                </ArtworkFrame>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {listing.item.name}
                    {listing.itemInstanceId && (
                      <Badge tone="accent" className="ml-2">
                        One of a kind
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs tabular-nums text-text-muted">
                    ×{listing.quantity} at {formatCoins(listing.unitPrice)} each
                  </p>
                </div>
                <form
                  action={updateListingPriceAction}
                  className="flex items-end gap-2"
                >
                  <input type="hidden" name="listingId" value={listing.id} />
                  <div>
                    <label
                      htmlFor={`price-${listing.id}`}
                      className="block text-xs font-medium text-text-muted"
                    >
                      Price
                    </label>
                    <input
                      id={`price-${listing.id}`}
                      name="unitPrice"
                      type="number"
                      min={1}
                      defaultValue={listing.unitPrice.toString()}
                      className="mt-0.5 w-24 rounded-control border border-border-strong bg-surface-raised px-2 py-1.5 text-sm tabular-nums text-text focus:outline-2 focus:outline-offset-1 focus:outline-accent"
                    />
                  </div>
                  <SubmitButton
                    variant="secondary"
                    pendingLabel="Saving…"
                    className="min-h-9 px-3 py-1.5"
                  >
                    Update
                  </SubmitButton>
                </form>
                <form action={cancelListingAction}>
                  <input type="hidden" name="listingId" value={listing.id} />
                  <IdempotencyField />
                  <SubmitButton
                    variant="quiet"
                    pendingLabel="Cancelling…"
                    className="min-h-9 px-3 py-1.5 text-danger hover:bg-danger-soft"
                  >
                    Cancel
                    <span className="sr-only">
                      {" "}
                      listing of {listing.item.name} and return it to your
                      satchel
                    </span>
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Surface>

      {/* Create listing */}
      <Surface as="section" raised aria-labelledby="list-heading" className="mt-4">
        <h2 id="list-heading" className="font-display text-lg font-semibold">
          List something
        </h2>
        {listableStacks.length === 0 && instances.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            Nothing in your satchel can be listed right now.
          </p>
        ) : (
          <>
            {listableStacks.length > 0 && (
              <form
                action={createListingAction}
                className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
              >
                <IdempotencyField />
                <FormField label="Item" htmlFor="list-item">
                  <Select id="list-item" name="itemId" required>
                    {listableStacks.map((asset) =>
                      asset.kind === "stack" ? (
                        <option key={asset.item.id} value={asset.item.id}>
                          {asset.item.name} (×{asset.quantity})
                        </option>
                      ) : null,
                    )}
                  </Select>
                </FormField>
                <FormField label="Quantity" htmlFor="list-qty">
                  <Input
                    id="list-qty"
                    name="quantity"
                    type="number"
                    min={1}
                    max={1000}
                    defaultValue={1}
                    required
                    className="sm:w-24"
                  />
                </FormField>
                <FormField label="Price each" htmlFor="list-price">
                  <Input
                    id="list-price"
                    name="unitPrice"
                    type="number"
                    min={1}
                    required
                    className="sm:w-28"
                  />
                </FormField>
                <SubmitButton pendingLabel="Listing…">List it</SubmitButton>
              </form>
            )}

            {instances.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-text">
                  One-of-a-kind pieces
                </h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {instances.map((asset) =>
                    asset.kind !== "instance" ? null : (
                    <li
                      key={asset.instanceId}
                      className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface p-2"
                    >
                      <ArtworkFrame aspect="square" className="w-10 shrink-0">
                        <ItemArt
                          artKey={asset.item.artKey}
                          categorySlug={asset.item.categorySlug ?? undefined}
                          label=""
                        />
                      </ArtworkFrame>
                      <p className="min-w-0 flex-1 truncate text-sm">
                        {asset.item.name}
                      </p>
                      <form
                        action={createListingAction}
                        className="flex items-end gap-2"
                      >
                        <IdempotencyField />
                        <input type="hidden" name="itemId" value={asset.item.id} />
                        <input
                          type="hidden"
                          name="itemInstanceId"
                          value={asset.instanceId}
                        />
                        <input type="hidden" name="quantity" value={1} />
                        <div>
                          <label
                            htmlFor={`iprice-${asset.instanceId}`}
                            className="block text-xs font-medium text-text-muted"
                          >
                            Price
                          </label>
                          <input
                            id={`iprice-${asset.instanceId}`}
                            name="unitPrice"
                            type="number"
                            min={1}
                            required
                            className="mt-0.5 w-24 rounded-control border border-border-strong bg-surface-raised px-2 py-1.5 text-sm text-text focus:outline-2 focus:outline-offset-1 focus:outline-accent"
                          />
                        </div>
                        <SubmitButton
                          variant="secondary"
                          pendingLabel="Listing…"
                          className="min-h-9 px-3 py-1.5"
                        >
                          List
                          <span className="sr-only"> {asset.item.name}</span>
                        </SubmitButton>
                      </form>
                    </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </>
        )}
      </Surface>

      {/* Capacity upgrades */}
      <Surface as="section" raised aria-labelledby="upgrades-heading" className="mt-4">
        <h2 id="upgrades-heading" className="font-display text-lg font-semibold">
          Capacity upgrades
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Permanent. Paid in coins. The shelves do not go back.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {tiers.map((tier) => {
            const owned = ownedTiers.has(tier.tier);
            const isNext = nextTier?.tier === tier.tier;
            return (
              <li
                key={tier.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {tier.name}{" "}
                    <span className="text-text-muted">
                      (+{tier.capacityBonus} slots)
                    </span>
                  </p>
                  <p className="text-xs tabular-nums text-text-muted">
                    {formatCoins(tier.price)} {coinLabel(tier.price)}
                  </p>
                </div>
                {owned ? (
                  <Badge tone="success">Owned</Badge>
                ) : isNext ? (
                  <form action={purchaseUpgradeAction}>
                    <input type="hidden" name="tier" value={tier.tier} />
                    <IdempotencyField />
                    <SubmitButton
                      variant="secondary"
                      pendingLabel="Buying…"
                      className="min-h-9 px-3 py-1.5"
                    >
                      Buy — {formatCoins(tier.price)}
                      <span className="sr-only"> coins</span>
                    </SubmitButton>
                  </form>
                ) : (
                  <Badge>Requires earlier tiers</Badge>
                )}
              </li>
            );
          })}
        </ul>
      </Surface>

      {/* Shop details */}
      <Surface as="section" raised aria-labelledby="details-heading" className="mt-4">
        <h2 id="details-heading" className="font-display text-lg font-semibold">
          Shopfront details
        </h2>
        <form
          action={updateShopDetailsAction}
          className="mt-3 flex flex-col gap-4"
        >
          <FormField
            label="Shop name"
            htmlFor="shop-name"
            help={`Up to ${SHOP_NAME_MAX} characters.`}
          >
            <Input
              id="shop-name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={SHOP_NAME_MAX}
              defaultValue={shop.name}
              aria-describedby="shop-name-help"
            />
          </FormField>
          <FormField
            label="Description"
            htmlFor="shop-description"
            help={`Plain text, up to ${SHOP_DESCRIPTION_MAX} characters.`}
          >
            <Input
              id="shop-description"
              name="description"
              type="text"
              maxLength={SHOP_DESCRIPTION_MAX}
              defaultValue={shop.description}
              aria-describedby="shop-description-help"
            />
          </FormField>
          <div>
            <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
          </div>
        </form>
      </Surface>

      {/* Sales history */}
      <Surface as="section" aria-labelledby="sales-heading" className="mt-4">
        <h2 id="sales-heading" className="font-display text-lg font-semibold">
          Recent sales
        </h2>
        {sales.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            No sales yet. Every shop starts somewhere.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {sales.map((sale) => (
              <li
                key={sale.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-1.5 last:border-b-0"
              >
                <span className="min-w-0 truncate">
                  ×{sale.quantity} {sale.item.name} →{" "}
                  {sale.buyer ? (
                    <Link
                      href={`/u/${sale.buyer.username}`}
                      className="text-accent underline underline-offset-2"
                    >
                      {sale.buyer.username}
                    </Link>
                  ) : (
                    "a wanderer"
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-text-muted">
                  +{formatCoins(sale.unitPrice * BigInt(sale.quantity))} ·{" "}
                  {sale.soldAt ? DATE_FORMAT.format(sale.soldAt) : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-text-muted">
          Full history lives in{" "}
          <Link
            href="/history"
            className="text-accent underline underline-offset-2"
          >
            your ledger
          </Link>
          .
        </p>
      </Surface>
    </>
  );
}
