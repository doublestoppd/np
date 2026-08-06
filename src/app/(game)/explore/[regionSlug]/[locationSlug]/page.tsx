import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getPublishedLocation } from "@/server/modules/world/world";
import { getShopForLocation } from "@/server/modules/commerce/npc-shops/queries";
import { purchaseNpcStockAction } from "@/server/actions/npc-shop";
import { ItemArt } from "@/components/art/item-art";
import { LocationArt } from "@/components/art/location-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { PageHeader } from "@/components/ui/page-header";
import { RarityBadge } from "@/components/ui/rarity-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { formatCoins } from "@/lib/money";
import { currentGameDate } from "@/server/modules/daily/game-day";
import {
  MEAL_LOCATION_SLUG,
  WHEEL_LOCATION_SLUG,
  WORD_LOCATION_SLUG,
} from "@/server/modules/daily/locations";
import { getBoard } from "@/server/modules/daily/word/game";
import { getWheelView } from "@/server/modules/daily/wheel/queries";
import { getMealView } from "@/server/modules/daily/food/queries";
import { claimMealAction } from "@/server/actions/daily";
import { WordGame } from "@/components/daily/word-game";
import { PrizeWheel } from "@/components/daily/prize-wheel";

interface LocationPageProps {
  params: Promise<{ regionSlug: string; locationSlug: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({
  params,
}: LocationPageProps): Promise<Metadata> {
  const { regionSlug, locationSlug } = await params;
  const location = await getPublishedLocation(prisma, regionSlug, locationSlug);
  return { title: location ? location.name : "Explore" };
}

export default async function LocationPage({
  params,
  searchParams,
}: LocationPageProps) {
  const user = await requireUser();
  const { regionSlug, locationSlug } = await params;
  const [location, queryParams] = await Promise.all([
    getPublishedLocation(prisma, regionSlug, locationSlug),
    searchParams,
  ]);
  if (!location) {
    notFound();
  }

  const shopData = await getShopForLocation(prisma, location.id);
  const returnTo = `/explore/${regionSlug}/${locationSlug}`;

  // Daily-activity locations render their activity below the flavor copy.
  const gameDate = currentGameDate();
  const wordBoards =
    location.slug === WORD_LOCATION_SLUG
      ? {
          EASY: await getBoard(prisma, {
            userId: user.id,
            gameDate,
            difficulty: "EASY",
          }),
          MEDIUM: await getBoard(prisma, {
            userId: user.id,
            gameDate,
            difficulty: "MEDIUM",
          }),
          HARD: await getBoard(prisma, {
            userId: user.id,
            gameDate,
            difficulty: "HARD",
          }),
        }
      : null;
  const wheelView =
    location.slug === WHEEL_LOCATION_SLUG
      ? await getWheelView(prisma, { userId: user.id, gameDate })
      : null;
  const mealView =
    location.slug === MEAL_LOCATION_SLUG
      ? await getMealView(prisma, { userId: user.id, gameDate })
      : null;
  const hasActivity =
    wordBoards !== null || wheelView !== null || mealView !== null;

  return (
    <>
      <ArtworkFrame aspect="wide" className="mb-4">
        <LocationArt artKey={location.artKey} label={location.name} />
      </ArtworkFrame>

      <PageHeader
        title={location.name}
        description={location.region.name}
        actions={
          <LinkButton href={`/explore/${location.region.slug}`} variant="secondary">
            Back to Map
          </LinkButton>
        }
      />

      <FeedbackBanner
        notice={firstParam(queryParams.notice)}
        error={firstParam(queryParams.error)}
      />

      <Surface as="section">
        <p className="max-w-prose text-sm leading-relaxed text-text">
          {location.description}
        </p>
      </Surface>

      {wordBoards && (
        <Surface as="section" raised className="mt-4">
          <WordGame boards={wordBoards} />
        </Surface>
      )}

      {wheelView && (
        <Surface as="section" raised className="mt-4">
          <PrizeWheel view={wheelView} />
        </Surface>
      )}

      {mealView && (
        <Surface as="section" raised aria-labelledby="meal-heading" className="mt-4">
          <h2 id="meal-heading" className="font-display text-lg font-semibold">
            Today&apos;s community meal
          </h2>
          {mealView.todaysClaim ? (
            <div className="mt-3 flex items-center gap-3">
              <ArtworkFrame aspect="square" className="w-16 shrink-0">
                <ItemArt
                  artKey={mealView.todaysClaim.itemArtKey}
                  categorySlug={mealView.todaysClaim.itemCategorySlug ?? undefined}
                  label=""
                />
              </ArtworkFrame>
              <div className="min-w-0">
                <p className="font-medium">
                  {mealView.todaysClaim.itemName}
                  {mealView.todaysClaim.quantity > 1
                    ? ` ×${mealView.todaysClaim.quantity}`
                    : ""}
                </p>
                <p className="mt-0.5 text-sm text-text-muted">
                  {mealView.todaysClaim.itemDescription}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  Served and stowed —{" "}
                  <Link
                    href="/inventory"
                    className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    see it in your inventory
                  </Link>
                  . The pot refills at midnight UTC.
                </p>
              </div>
            </div>
          ) : mealView.available ? (
            <>
              <p className="mt-1 max-w-prose text-sm text-text-muted">
                One free meal a day, ladled from whatever the pot decided to
                be this morning.
              </p>
              <form action={claimMealAction} className="mt-3">
                <IdempotencyField />
                <SubmitButton pendingLabel="Ladling…">
                  Claim today&apos;s meal
                </SubmitButton>
              </form>
            </>
          ) : (
            <p className="mt-1 text-sm text-text-muted">
              The kitchen is closed today. The pot apologizes.
            </p>
          )}
        </Surface>
      )}

      {shopData ? (
        <Surface as="section" raised aria-labelledby="shop-heading" className="mt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="shop-heading" className="font-display text-lg font-semibold">
                {shopData.shop.name}
              </h2>
              <p className="mt-1 max-w-prose text-sm text-text-muted">
                {shopData.shop.description}
              </p>
            </div>
            <Badge tone="accent" className="shrink-0">
              <span aria-hidden="true">🪙</span> {formatCoins(user.coins)} coins
            </Badge>
          </div>

          {shopData.shop.keeperCopy && (
            <p className="mt-3 max-w-prose rounded-control border border-border bg-background px-4 py-3 text-sm italic text-text-muted">
              {shopData.shop.keeperCopy}
            </p>
          )}

          {shopData.stock.length === 0 ? (
            <p className="mt-4 rounded-control border border-dashed border-border-strong px-4 py-6 text-center text-sm text-text-muted">
              The shelves are bare. The proprietor offers no explanation.
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {shopData.stock.map((stock) => (
                <li
                  key={stock.id}
                  className="flex gap-3 rounded-surface border border-border bg-surface p-3"
                >
                  <ArtworkFrame aspect="square" className="w-16 shrink-0 self-start">
                    <ItemArt
                      artKey={stock.item.artKey}
                      categorySlug={stock.item.category?.slug}
                      label=""
                    />
                  </ArtworkFrame>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">
                        <Link
                          href={`/items/${stock.item.slug}`}
                          className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          {stock.item.name}
                        </Link>
                      </h3>
                      <RarityBadge rarity={stock.item.rarity} />
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {formatCoins(stock.price)} coins · {stock.quantity} in stock
                    </p>
                    <form
                      action={purchaseNpcStockAction}
                      className="mt-2 flex items-end gap-2"
                    >
                      <input type="hidden" name="stockId" value={stock.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <IdempotencyField />
                      <div>
                        <label
                          htmlFor={`qty-${stock.id}`}
                          className="block text-xs font-medium text-text-muted"
                        >
                          Qty
                        </label>
                        <input
                          id={`qty-${stock.id}`}
                          name="quantity"
                          type="number"
                          min={1}
                          max={Math.min(10, stock.quantity)}
                          defaultValue={1}
                          className="mt-0.5 w-16 rounded-control border border-border-strong bg-surface-raised px-2 py-1.5 text-sm text-text focus:outline-2 focus:outline-offset-1 focus:outline-accent"
                        />
                      </div>
                      <SubmitButton pendingLabel="Buying…" className="min-h-9 px-3 py-1.5">
                        Buy — {formatCoins(stock.price)}
                        <span className="sr-only">
                          {" "}
                          coins each, {stock.item.name}
                        </span>
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      ) : hasActivity ? null : (
        <Surface as="section" className="mt-4">
          <h2 className="font-display text-base font-semibold">
            More to discover later
          </h2>
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            There is more here than meets the eye. It is not, for the moment,
            meeting the eye.
          </p>
        </Surface>
      )}
    </>
  );
}
