import { prisma } from "@/server/db";
import { getShopForLocation } from "@/server/modules/commerce/npc-shops/queries";
import { purchaseNpcStockAction } from "@/server/actions/npc-shop";
import { formatCoins } from "@/lib/money";
import { ItemArt } from "@/components/art/item-art";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { ItemIdentity } from "@/components/ui/item-identity";
import { SubmitButton } from "@/components/ui/submit-button";
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
              href={`/items/${stock.item.slug}?from=explore`}
              rarity={stock.item.rarity}
              art={
                <ItemArt
                  artKey={stock.item.artKey}
                  categorySlug={stock.item.category?.slug}
                  label=""
                />
              }
              meta={`${stock.quantity} in stock`}
              price={<CurrencyAmount amount={stock.price} />}
              action={
                <form
                  action={purchaseNpcStockAction}
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="stockId" value={stock.id} />
                  <input type="hidden" name="returnTo" value={location.path} />
                  <IdempotencyField />
                  <div>
                    <label
                      htmlFor={`qty-${stock.id}`}
                      className="block text-xs font-medium text-text-muted"
                    >
                      Qty
                    </label>
                    <div className="mt-0.5 w-20">
                      <Input
                        id={`qty-${stock.id}`}
                        name="quantity"
                        type="number"
                        min={1}
                        max={Math.min(10, stock.quantity)}
                        defaultValue={1}
                      />
                    </div>
                  </div>
                  <SubmitButton pendingLabel="Buying…">
                    Buy
                    <span className="sr-only">
                      {" "}
                      {stock.item.name} for {formatCoins(stock.price)} coins each
                    </span>
                  </SubmitButton>
                </form>
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
