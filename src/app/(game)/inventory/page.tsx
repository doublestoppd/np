import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { feedPetAction } from "@/server/actions/pets";
import {
  listInventory,
  listItemCategories,
} from "@/server/services/inventory";
import { ItemArt } from "@/components/art/item-art";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { ContentCard } from "@/components/ui/content-card";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField, Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { inventoryQuerySchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Inventory" };

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

  const [entries, categories, pet] = await Promise.all([
    listInventory(prisma, user.id, {
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

  return (
    <>
      <PageHeader
        title="Inventory"
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

      <form
        method="get"
        action="/inventory"
        className="mb-4 grid grid-cols-1 gap-3 rounded-surface border border-border bg-surface p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
      >
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
      </form>

      {entries.length === 0 ? (
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
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {entries.map((entry) => (
            <ContentCard
              key={entry.id}
              as="li"
              title={entry.item.name}
              href={`/items/${entry.item.slug}`}
              media={
                <ItemArt
                  artKey={entry.item.artKey}
                  categorySlug={entry.item.category?.slug}
                  label=""
                />
              }
              subtitle={
                <>
                  {entry.item.category?.name ?? "Miscellany"} · ×
                  {entry.quantity} · worth {entry.item.price}{" "}
                  {entry.item.price === 1 ? "coin" : "coins"}
                </>
              }
              footer={
                <>
                  {entry.item.tags.map((tag) => (
                    <Badge key={tag.id}>{tag.name}</Badge>
                  ))}
                  {entry.item.type === "FOOD" && pet && (
                    <form action={feedPetAction} className="ml-auto">
                      <input type="hidden" name="petId" value={pet.id} />
                      <input type="hidden" name="itemId" value={entry.itemId} />
                      <input type="hidden" name="returnTo" value="/inventory" />
                      <SubmitButton pendingLabel="Feeding…">
                        Feed
                        <span className="sr-only">
                          {" "}
                          {entry.item.name} to {pet.name}
                        </span>
                      </SubmitButton>
                    </form>
                  )}
                </>
              }
            >
              {entry.item.description}
            </ContentCard>
          ))}
        </ul>
      )}
    </>
  );
}
