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
import { MARKET_PAGE_SIZES, marketSearchSchema } from "@/lib/validation";

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
    page: firstParam(params.page),
    perPage: firstParam(params.perPage),
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
      page: query.page,
      perPage: query.perPage,
    }),
  ]);

  /** A link to another page of the same search. */
  function pageHref(page: number): string {
    const next = new URLSearchParams();
    if (query.q) next.set("q", query.q);
    if (query.category) next.set("category", query.category);
    if (query.rarity) next.set("rarity", query.rarity);
    next.set("perPage", String(results.perPage));
    next.set("page", String(page));
    return `/market?${next.toString()}`;
  }

  const firstOnPage = (results.page - 1) * results.perPage + 1;
  const lastOnPage = firstOnPage + results.items.length - 1;

  return (
    <>
      <PageHeader
        title="Market"
        description="Everything players are selling right now."
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
        <FormField label="Per page" htmlFor="perPage">
          <Select
            id="perPage"
            name="perPage"
            defaultValue={String(results.perPage)}
          >
            {MARKET_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </FormField>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </FilterBar>

      {results.items.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Nothing for sale"
          description="The market only lists what players are selling right now. Try a different name, category, or rarity — or check back later."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {results.items.map((item) => (
            <ContentCard
              key={item.id}
              as="li"
              title={item.name}
              href={`/items/${item.slug}?from=market`}
              media={
                <ItemArt
                  artKey={item.artKey}
                  categorySlug={item.category?.slug}
                  label=""
                />
              }
              subtitle={
                <span className="flex flex-col items-start gap-1">
                  <RarityBadge rarity={item.rarity} />
                  <span>
                    {item._count.playerListings === 1
                      ? "1 for sale"
                      : `${item._count.playerListings} for sale`}
                  </span>
                </span>
              }
            >
              <span className="line-clamp-2">{item.description}</span>
            </ContentCard>
          ))}
        </ul>
      )}

      {results.total > 0 && (
        <nav
          aria-label="Market pages"
          className="mt-4 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm text-text-muted">
            Showing {firstOnPage}–{lastOnPage} of {results.total}
          </p>
          {results.pageCount > 1 && (
            // Unavailable directions are omitted rather than rendered as
            // inert look-alikes: a "Previous" that is text on page 1 reads
            // as a broken control to everyone and as nothing at all to a
            // screen reader.
            <div className="flex items-center gap-2">
              {results.page > 1 && (
                <LinkButton href={pageHref(results.page - 1)} variant="quiet">
                  <span aria-hidden="true">← </span>Previous
                </LinkButton>
              )}
              <p className="text-sm text-text-muted">
                Page {results.page} of {results.pageCount}
              </p>
              {results.page < results.pageCount && (
                <LinkButton href={pageHref(results.page + 1)} variant="quiet">
                  Next<span aria-hidden="true"> →</span>
                </LinkButton>
              )}
            </div>
          )}
        </nav>
      )}
    </>
  );
}
