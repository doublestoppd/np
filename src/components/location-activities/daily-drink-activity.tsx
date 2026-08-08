import { prisma } from "@/server/db";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { getMealView } from "@/server/modules/daily/food/queries";
import { WARMING_HUT_POOL_SLUG } from "@/server/modules/daily/food/claim";
import { claimDrinkAction } from "@/server/actions/daily";
import { ItemArt } from "@/components/art/item-art";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { ItemIdentity } from "@/components/ui/item-identity";
import { StatusBadge, type PlayerStatus } from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextLink } from "@/components/ui/text-link";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";

/**
 * The Warming Hut's free drink.
 *
 * Mechanically the community meal with a different pool, and that is the
 * point: the same verb, at a different altitude, paying in `brewed`
 * things the kitchen never serves. It claims independently of the meal —
 * the claim row is scoped per pool, so having lunch does not use up your
 * cup of tea.
 */
export async function DailyDrinkLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  const gameDate = currentGameDate();
  const view = await getMealView(prisma, {
    userId: viewer.id,
    gameDate,
    poolSlug: WARMING_HUT_POOL_SLUG,
  });

  const status: { status: PlayerStatus; label: string } = view.todaysClaim
    ? { status: "CLAIMED", label: "Had one today" }
    : view.available
      ? { status: "AVAILABLE", label: "Available today" }
      : { status: "UNAVAILABLE", label: "Stove out" };

  return (
    <ActivitySection
      headingId="activity-daily-drink"
      title="Something hot"
      status={status}
    >
      {view.todaysClaim ? (
        <div>
          <ItemIdentity
            name={view.todaysClaim.itemName}
            art={
              <ItemArt
                artKey={view.todaysClaim.itemArtKey}
                categorySlug={view.todaysClaim.itemCategorySlug ?? undefined}
                label=""
              />
            }
            badges={<StatusBadge status="CLAIMED" label="Had one today" />}
            meta={
              view.todaysClaim.quantity > 1
                ? `×${view.todaysClaim.quantity}`
                : undefined
            }
          />
          <p className="mt-2 text-sm text-text-muted">
            {view.todaysClaim.itemDescription}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Poured and pocketed —{" "}
            <TextLink href="/inventory">see it in your satchel</TextLink>. The
            stove is lit again at midnight GST.
          </p>
        </div>
      ) : view.available ? (
        <>
          <p className="max-w-prose text-sm text-text-muted">
            Whatever is on the stove, once a day, for nothing. Nobody keeps a
            tally and the hut would be embarrassed if you offered.
          </p>
          <form action={claimDrinkAction} className="mt-3">
            <IdempotencyField />
            <SubmitButton pendingLabel="Pouring…">
              Take something hot
            </SubmitButton>
          </form>
        </>
      ) : (
        <p className="text-sm text-text-muted">
          The stove has gone out and nobody has been up to see to it. Nothing
          is lost — it will be lit again before long.
        </p>
      )}
    </ActivitySection>
  );
}
