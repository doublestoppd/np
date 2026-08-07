import { prisma } from "@/server/db";
import { getShopForLocation } from "@/server/modules/commerce/npc-shops/queries";
import { coinsToJSON } from "@/lib/money";
import { describeItemUse } from "@/lib/pet-condition";
import { ItemArt } from "@/components/art/item-art";
import { PurchaseDialog } from "@/components/commerce/purchase-dialog";
import { purchaseNpcStockAction } from "@/server/actions/npc-shop";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { Badge } from "@/components/ui/badge";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemIdentity } from "@/components/ui/item-identity";
import { RarityBadge } from "@/components/ui/rarity-badge";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";

/**
 * NPC shop as a location activity. Stock, pricing, and restocking stay in
 * modules/commerce; this component only presents them.
 */
export async function NpcShopLocationActivity({
  attachment,
  location,
  viewer,
}: LocationActivityRendererProps) {
  const shopData = await getShopForLocation(prisma, location.id);
  if (!shopData || shopData.shop.slug !== attachment.activityKey) {
    // The attachment points at a shop that isn't here (or isn't active) —
    // isolated as an unavailable panel by the registry.
    throw new Error(
      `NPC shop "${attachment.activityKey}" is not available at ${location.slug}`,
    );
  }

  return (
    <ActivitySection
      headingId="activity-npc-shop"
      title={shopData.shop.name}
      description={
        // The location page already names the place; only add the shop's
        // own line when it says something different.
        shopData.shop.description === location.name
          ? undefined
          : shopData.shop.description
      }
    >
      {shopData.shop.keeperCopy && (
        <p className="mb-3 max-w-prose rounded-control border border-border bg-background px-4 py-3 text-sm italic text-text-muted">
          {shopData.shop.keeperCopy}
        </p>
      )}

      {shopData.stock.length === 0 ? (
        <EmptyState
          icon="🧺"
          headingAs="h3"
          title="The shelves are bare"
          description="The proprietor offers no explanation. Wares return on their own schedule."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {shopData.stock.map((stock) => (
            <ItemIdentity
              as="li"
              key={stock.id}
              name={stock.item.name}
              href={`/items/${stock.item.slug}?from=explore:${location.regionSlug}:${location.slug}`}
              rarity={stock.item.rarity}
              art={
                <ItemArt
                  artKey={stock.item.artKey}
                  categorySlug={stock.item.category?.slug}
                  label=""
                />
              }
              meta={[describeItemUse(stock.item), `${stock.quantity} in stock`]
                .filter(Boolean)
                .join(" · ")}
              price={<CurrencyAmount amount={stock.price} />}
              actionPlacement="inline"
              action={
                <PurchaseDialog
                  action={purchaseNpcStockAction}
                  hiddenFields={{
                    stockId: stock.id,
                    returnTo: location.path,
                  }}
                  available={stock.quantity}
                  balanceJson={coinsToJSON(viewer.coins)}
                  item={{
                    name: stock.item.name,
                    slug: stock.item.slug,
                    description: stock.item.description,
                    categoryName: stock.item.category?.name ?? null,
                    useSummary: describeItemUse(stock.item),
                    priceJson: coinsToJSON(stock.price),
                    tradeable: stock.item.tradeable,
                    stackable: stock.item.stackable,
                  }}
                  art={
                    <ArtworkFrame aspect="square">
                      <ItemArt
                        artKey={stock.item.artKey}
                        categorySlug={stock.item.category?.slug}
                        label=""
                      />
                    </ArtworkFrame>
                  }
                  badges={
                    <>
                      <RarityBadge rarity={stock.item.rarity} />
                      {stock.item.category && (
                        <Badge>{stock.item.category.name}</Badge>
                      )}
                      {stock.item.tags.map((tag) => (
                        <Badge key={tag.id}>{tag.name}</Badge>
                      ))}
                      {!stock.item.tradeable && (
                        <Badge tone="danger">Not tradeable</Badge>
                      )}
                      {!stock.item.stackable && (
                        <Badge tone="accent">One of a kind</Badge>
                      )}
                    </>
                  }
                />
              }
            />
          ))}
        </ul>
      )}

      <p className="mt-4 text-sm text-text-muted">
        <span className="sr-only">Your balance: </span>
        You have <CurrencyAmount amount={viewer.coins} />.
      </p>
    </ActivitySection>
  );
}
