import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getPublishedLocation } from "@/server/modules/world/world";
import { getShopForLocation } from "@/server/modules/commerce/npc-shops/queries";
import { purchaseNpcStockAction } from "@/server/actions/npc-shop";
import { ItemArt } from "@/components/art/item-art";
import { LocationArt } from "@/components/art/location-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/field";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { ItemIdentity } from "@/components/ui/item-identity";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge, type PlayerStatus } from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { formatCoins } from "@/lib/money";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { dailyActivityAt } from "@/server/modules/daily/locations";
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
  // Matching includes the region: location slugs are region-scoped.
  const gameDate = currentGameDate();
  const activity = dailyActivityAt(location.region.slug, location.slug);
  const wordBoards =
    activity === "WORD"
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
    activity === "WHEEL"
      ? await getWheelView(prisma, { userId: user.id, gameDate })
      : null;
  const mealView =
    activity === "MEAL"
      ? await getMealView(prisma, { userId: user.id, gameDate })
      : null;
  const hasActivity =
    wordBoards !== null || wheelView !== null || mealView !== null;

  // Current-day activity status shown near the title (shared vocabulary).
  const boardsArray = wordBoards ? Object.values(wordBoards) : [];
  const terminalBoards = boardsArray.filter(
    (board) => board.status !== "IN_PROGRESS",
  ).length;
  const activityStatus: { status: PlayerStatus; label: string } | null =
    activity === "WORD"
      ? terminalBoards === 3
        ? { status: "COMPLETED", label: "Done for today" }
        : terminalBoards > 0 ||
            boardsArray.some((board) => board.attemptsUsed > 0)
          ? { status: "IN_PROGRESS", label: `${terminalBoards}/3 done` }
          : { status: "AVAILABLE", label: "Available today" }
      : activity === "WHEEL" && wheelView
        ? wheelView.todaysSpin
          ? { status: "COMPLETED", label: "Spun today" }
          : wheelView.available
            ? { status: "AVAILABLE", label: "Available today" }
            : { status: "UNAVAILABLE", label: "Resting today" }
        : activity === "MEAL" && mealView
          ? mealView.todaysClaim
            ? { status: "CLAIMED", label: "Claimed today" }
            : mealView.available
              ? { status: "AVAILABLE", label: "Available today" }
              : { status: "UNAVAILABLE", label: "Kitchen closed" }
          : null;

  return (
    <>
      {/* 1. Hero establishes the mood before any interaction. */}
      <ArtworkFrame aspect="wide" focal="center" className="mb-4">
        <LocationArt artKey={location.artKey} label="" />
      </ArtworkFrame>

      {/* 2-3. Title with quiet back navigation, then flavor (no card). */}
      <PageHeader
        title={location.name}
        backHref={`/explore/${location.region.slug}`}
        backLabel={`Back to ${location.region.name}`}
      />

      <p className="-mt-1 mb-4 max-w-prose text-sm leading-relaxed text-text">
        {location.description}
      </p>

      <FeedbackBanner
        notice={firstParam(queryParams.notice)}
        error={firstParam(queryParams.error)}
      />

      {/* 4. Today's status for activity locations. */}
      {activityStatus && (
        <p className="mb-4">
          <StatusBadge
            status={activityStatus.status}
            label={activityStatus.label}
          />
        </p>
      )}

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
          <SectionHeading id="meal-heading">
            Today&apos;s community meal
          </SectionHeading>
          {mealView.todaysClaim ? (
            /* The claimed result stays visible for the rest of the game
               day: artwork, name, description, inventory confirmation. */
            <div className="mt-3">
              <ItemIdentity
                name={mealView.todaysClaim.itemName}
                art={
                  <ItemArt
                    artKey={mealView.todaysClaim.itemArtKey}
                    categorySlug={
                      mealView.todaysClaim.itemCategorySlug ?? undefined
                    }
                    label=""
                  />
                }
                badges={<StatusBadge status="CLAIMED" label="Claimed today" />}
                meta={
                  mealView.todaysClaim.quantity > 1
                    ? `×${mealView.todaysClaim.quantity}`
                    : undefined
                }
              />
              <p className="mt-2 text-sm text-text-muted">
                {mealView.todaysClaim.itemDescription}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Served and stowed —{" "}
                <TextLink href="/inventory">see it in your inventory</TextLink>.
                The pot refills at midnight UTC.
              </p>
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
              The kitchen is closed today. The pot apologizes. Nothing is
              lost — your companion is perfectly fine without it.
            </p>
          )}
        </Surface>
      )}

      {shopData ? (
        <Surface as="section" raised aria-labelledby="shop-heading" className="mt-4">
          <SectionHeading
            id="shop-heading"
            description={shopData.shop.description}
            action={
              <span className="text-sm text-text-muted">
                <span className="sr-only">Your balance: </span>
                <CurrencyAmount amount={user.coins} compact />
              </span>
            }
          >
            {shopData.shop.name}
          </SectionHeading>

          {shopData.shop.keeperCopy && (
            <p className="mt-3 max-w-prose rounded-control border border-border bg-background px-4 py-3 text-sm italic text-text-muted">
              {shopData.shop.keeperCopy}
            </p>
          )}

          {shopData.stock.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon="🧺"
                title="The shelves are bare"
                description="The proprietor offers no explanation. Wares return on their own schedule."
              />
            </div>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {shopData.stock.map((stock) => (
                <ItemIdentity
                  as="li"
                  key={stock.id}
                  name={stock.item.name}
                  href={`/items/${stock.item.slug}`}
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
                      <input type="hidden" name="returnTo" value={returnTo} />
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
                          {stock.item.name} for {formatCoins(stock.price)} coins
                          each
                        </span>
                      </SubmitButton>
                    </form>
                  }
                />
              ))}
            </ul>
          )}
        </Surface>
      ) : hasActivity ? null : (
        <div className="mt-4">
          <EmptyState
            icon="🌫️"
            title="More to discover later"
            description="There is more here than meets the eye. It is not, for the moment, meeting the eye."
          />
        </div>
      )}
    </>
  );
}
