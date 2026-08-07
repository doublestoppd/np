import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { feedPetAction, playWithPetAction } from "@/server/actions/pets";
import { getScratchCardView } from "@/server/modules/scratch/queries";
import { ScratchDialog } from "@/components/scratch/scratch-dialog";
import {
  assetIsUsable,
  listOwnedAssets,
  type OwnedAsset,
} from "@/server/modules/items/ownership-view";
import { listItemCategories } from "@/server/modules/items/inventory-query";
import { ItemArt } from "@/components/art/item-art";
import { Badge } from "@/components/ui/badge";
import { TagBadge } from "@/components/ui/tag-badge";
import { Button, LinkButton } from "@/components/ui/button";
import { ContentCard } from "@/components/ui/content-card";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { FilterBar } from "@/components/ui/filter-bar";
import { FormField, Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { inventoryQuerySchema } from "@/lib/validation";
import { coinLabel, formatCoins } from "@/lib/money";
import { describeItemUse } from "@/lib/pet-condition";

export const metadata: Metadata = { title: "Satchel" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const query = inventoryQuerySchema.parse({
    q: firstParam(params.q),
    category: firstParam(params.category),
    sort: firstParam(params.sort) ?? "name",
  });

  const [assets, categories, pet] = await Promise.all([
    listOwnedAssets(prisma, user.id, {
      search: query.q,
      category: query.category,
      sort: query.sort,
    }),
    listItemCategories(prisma),
    prisma.pet.findFirst({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // The prize ladder and the live pool for every chit in the satchel.
  // Not the odds — those are deliberately unpublished (ADR-48).
  const scratchOdds = new Map(
    (
      await Promise.all(
        assets
          .filter(
            (asset) =>
              asset.kind === "stack" && asset.item.type === "SCRATCH_CARD",
          )
          .map((asset) => getScratchCardView(prisma, { itemId: asset.item.id })),
      )
    )
      .filter((odds) => odds !== null)
      .map((odds) => [odds.itemId, odds]),
  );

  const hasFilters = Boolean(query.q || query.category);

  const subtitleFor = (asset: OwnedAsset) => {
    // Same vocabulary as the item detail page and the shop shelves, so one
    // value has one name wherever a player meets it.
    const worth = `est. ${formatCoins(asset.item.price)} ${coinLabel(asset.item.price)}`;
    const count =
      asset.kind === "stack" ? `×${asset.quantity}` : "one of a kind";
    return [
      asset.item.categoryName ?? "Miscellany",
      count,
      describeItemUse(asset.item),
      worth,
    ]
      .filter(Boolean)
      .join(" · ");
  };

  return (
    <>
      <PageHeader
        title="Satchel"
        description="Everything you're carrying. What any of it means is up to you."
        actions={
          <>
            <LinkButton href="/market" variant="secondary">
              Market
            </LinkButton>
            <LinkButton href="/shop" variant="secondary">
              Your shop
            </LinkButton>
          </>
        }
      />

      <FeedbackBanner
        notice={firstParam(params.notice)}
        error={firstParam(params.error)}
      />

      <FilterBar action="/inventory">
        <FormField label="Search" htmlFor="q">
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={query.q ?? ""}
            placeholder="Name or description"
            maxLength={60}
          />
        </FormField>
        <FormField label="Category" htmlFor="category">
          <Select
            id="category"
            name="category"
            defaultValue={query.category ?? ""}
          >
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Sort by" htmlFor="sort">
          <Select id="sort" name="sort" defaultValue={query.sort}>
            <option value="name">Name</option>
            <option value="quantity">Quantity</option>
            <option value="value">Value</option>
          </Select>
        </FormField>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </FilterBar>

      {assets.length === 0 ? (
        <EmptyState
          icon="🎒"
          title={hasFilters ? "Nothing matches" : "Your satchel is empty"}
          description={
            hasFilters
              ? "Try a different search or category."
              : "Items you collect will appear here."
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {assets.map((asset) => (
            <ContentCard
              key={asset.kind === "stack" ? asset.item.id : asset.instanceId}
              as="li"
              title={asset.item.name}
              href={`/items/${asset.item.slug}?from=inventory`}
              media={
                <ItemArt
                  artKey={asset.item.artKey}
                  categorySlug={asset.item.categorySlug ?? undefined}
                  label=""
                />
              }
              subtitle={subtitleFor(asset)}
              footer={
                <>
                  {asset.item.tags.map((tag) => (
                    <TagBadge key={tag.slug} slug={tag.slug} name={tag.name} />
                  ))}
                  {asset.kind === "instance" && (
                    <Badge tone="accent">One of a kind</Badge>
                  )}
                  {asset.item.lifecycle === "RETIRED" && (
                    <Badge tone="warning">Retired</Badge>
                  )}
                  {asset.kind === "stack" &&
                    asset.item.type === "SCRATCH_CARD" &&
                    assetIsUsable(asset) &&
                    scratchOdds.has(asset.item.id) && (
                      <div className="ml-auto">
                        <ScratchDialog
                          itemId={asset.item.id}
                          itemName={asset.item.name}
                          owned={asset.quantity}
                          returnTo="/inventory"
                          priceJson={scratchOdds.get(asset.item.id)!.priceJson}
                          prizes={scratchOdds.get(asset.item.id)!.prizes}
                          topPrize={scratchOdds.get(asset.item.id)!.topPrize}
                          jackpotJson={
                            scratchOdds.get(asset.item.id)!.jackpot.standsAt
                          }
                        />
                      </div>
                    )}
                  {asset.kind === "stack" &&
                    asset.item.type === "TOY" &&
                    assetIsUsable(asset) &&
                    pet && (
                      <form action={playWithPetAction} className="ml-auto">
                        <input type="hidden" name="petId" value={pet.id} />
                        <input type="hidden" name="itemId" value={asset.item.id} />
                        <input type="hidden" name="returnTo" value="/inventory" />
                        <IdempotencyField />
                        <SubmitButton pendingLabel="Playing…">
                          Play
                          <span className="sr-only">
                            {" "}
                            with {asset.item.name}
                          </span>
                        </SubmitButton>
                      </form>
                    )}
                  {asset.kind === "stack" &&
                    asset.item.type === "FOOD" &&
                    assetIsUsable(asset) &&
                    pet && (
                      <form action={feedPetAction} className="ml-auto">
                        <input type="hidden" name="petId" value={pet.id} />
                        <input type="hidden" name="itemId" value={asset.item.id} />
                        <input type="hidden" name="returnTo" value="/inventory" />
                        <IdempotencyField />
                        <SubmitButton pendingLabel="Feeding…">
                          Feed
                          <span className="sr-only">
                            {" "}
                            {asset.item.name} to {pet.name}
                          </span>
                        </SubmitButton>
                      </form>
                    )}
                </>
              }
            >
              {asset.item.description}
            </ContentCard>
          ))}
        </ul>
      )}
    </>
  );
}
