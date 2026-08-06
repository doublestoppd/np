import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { feedPetAction } from "@/server/actions/pets";
import {
  assetIsUsable,
  listOwnedAssets,
  type OwnedAsset,
} from "@/server/modules/items/ownership-view";
import { listItemCategories } from "@/server/modules/items/inventory-query";
import { ItemArt } from "@/components/art/item-art";
import { Badge } from "@/components/ui/badge";
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

  const hasFilters = Boolean(query.q || query.category);

  const subtitleFor = (asset: OwnedAsset) => {
    // Same wording as the item detail page, so one value has one name.
    const worth = `est. ${formatCoins(asset.item.price)} ${coinLabel(asset.item.price)}`;
    if (asset.kind === "stack") {
      return `${asset.item.categoryName ?? "Miscellany"} · ×${asset.quantity} · ${worth}`;
    }
    return `${asset.item.categoryName ?? "Miscellany"} · one of a kind · ${worth}`;
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
                    <Badge key={tag.slug}>{tag.name}</Badge>
                  ))}
                  {asset.kind === "instance" && (
                    <Badge tone="accent">One of a kind</Badge>
                  )}
                  {asset.item.lifecycle === "RETIRED" && (
                    <Badge tone="warning">Retired</Badge>
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
