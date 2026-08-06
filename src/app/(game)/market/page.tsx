import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { searchItems } from "@/server/modules/commerce/search";
import { listItemCategories } from "@/server/modules/items/inventory-query";
import { enforceCommerceRateLimit } from "@/server/modules/commerce/config";
import { RateLimitedError } from "@/server/security/rate-limit";
import { ItemArt } from "@/components/art/item-art";
import { Button, LinkButton } from "@/components/ui/button";
import { ContentCard } from "@/components/ui/content-card";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FilterBar } from "@/components/ui/filter-bar";
import { FormField, Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { RarityBadge } from "@/components/ui/rarity-badge";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { marketSearchSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Market" };

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = marketSearchSchema.parse({
    q: firstParam(params.q),
    category: firstParam(params.category),
    rarity: firstParam(params.rarity),
    tradeable: firstParam(params.tradeable),
    cursor: firstParam(params.cursor),
  });

  try {
    await enforceCommerceRateLimit(prisma, "market-search", user.id);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return (
        <>
          <PageHeader title="Market" />
          <EmptyState
            icon="🫖"
            title="Take a breath"
            description="You're searching a little fast. Give it a moment and try again."
          />
        </>
      );
    }
    throw error;
  }

  const [categories, results] = await Promise.all([
    listItemCategories(prisma),
    searchItems(prisma, {
      q: query.q,
      category: query.category,
      rarity: query.rarity,
      tradeableOnly: query.tradeable === "1",
      cursor: query.cursor,
    }),
  ]);

  const nextParams = new URLSearchParams();
  if (query.q) nextParams.set("q", query.q);
  if (query.category) nextParams.set("category", query.category);
  if (query.rarity) nextParams.set("rarity", query.rarity);
  if (query.tradeable) nextParams.set("tradeable", query.tradeable);
  if (results.nextCursor) nextParams.set("cursor", results.nextCursor);

  return (
    <>
      <PageHeader
        title="Market"
        description="Browse the catalog and compare what players are selling."
        actions={
          <LinkButton href="/shop" variant="secondary">
            Your shop
          </LinkButton>
        }
      />

      <FeedbackBanner
        notice={firstParam(params.notice)}
        error={firstParam(params.error)}
      />

      <FilterBar action="/market">
        <FormField label="Search items" htmlFor="q">
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={query.q ?? ""}
            placeholder="Item name"
            maxLength={60}
          />
        </FormField>
        <FormField label="Category" htmlFor="category">
          <Select id="category" name="category" defaultValue={query.category ?? ""}>
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Rarity" htmlFor="rarity">
          <Select id="rarity" name="rarity" defaultValue={query.rarity ?? ""}>
            <option value="">Any</option>
            <option value="COMMON">Common</option>
            <option value="UNCOMMON">Uncommon</option>
            <option value="RARE">Rare</option>
            <option value="ULTRA_RARE">Ultra-rare</option>
          </Select>
        </FormField>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        <label className="flex items-center gap-2 text-sm text-text-muted sm:col-span-4">
          <input
            type="checkbox"
            name="tradeable"
            value="1"
            defaultChecked={query.tradeable === "1"}
            className="size-4 accent-accent"
          />
          Tradeable items only
        </label>
      </FilterBar>

      {results.items.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Nothing matches"
          description="Try a different name, category, or rarity."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {results.items.map((item) => (
            <ContentCard
              key={item.id}
              as="li"
              title={item.name}
              href={`/items/${item.slug}`}
              media={
                <ItemArt
                  artKey={item.artKey}
                  categorySlug={item.category?.slug}
                  label=""
                />
              }
              subtitle={
                <span className="flex flex-wrap items-center gap-2">
                  <RarityBadge rarity={item.rarity} />
                  <span>
                    {item._count.playerListings > 0
                      ? `${item._count.playerListings} for sale`
                      : "None for sale"}
                  </span>
                </span>
              }
            >
              <span className="line-clamp-2">{item.description}</span>
            </ContentCard>
          ))}
        </ul>
      )}

      {results.nextCursor && (
        <div className="mt-4 flex justify-center">
          <LinkButton
            href={`/market?${nextParams.toString()}`}
            variant="quiet"
          >
            Show more
          </LinkButton>
        </div>
      )}
    </>
  );
}
