import { prisma } from "@/server/db";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { getMealView } from "@/server/modules/daily/food/queries";
import { claimMealAction } from "@/server/actions/daily";
import { ItemArt } from "@/components/art/item-art";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { ItemIdentity } from "@/components/ui/item-identity";
import { StatusBadge, type PlayerStatus } from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextLink } from "@/components/ui/text-link";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";

/** Daily community meal as a location activity. */
export async function DailyMealLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  const gameDate = currentGameDate();
  const view = await getMealView(prisma, { userId: viewer.id, gameDate });

  const status: { status: PlayerStatus; label: string } = view.todaysClaim
    ? { status: "CLAIMED", label: "Claimed today" }
    : view.available
      ? { status: "AVAILABLE", label: "Available today" }
      : { status: "UNAVAILABLE", label: "Kitchen closed" };

  return (
    <ActivitySection
      headingId="activity-daily-meal"
      title="Today's community meal"
      status={status}
    >
      {view.todaysClaim ? (
        /* The claimed result stays visible for the rest of the game day. */
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
            badges={<StatusBadge status="CLAIMED" label="Claimed today" />}
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
            Served and stowed —{" "}
            <TextLink href="/inventory">see it in your satchel</TextLink>. The
            pot refills at midnight GST.
          </p>
        </div>
      ) : view.available ? (
        <>
          <p className="max-w-prose text-sm text-text-muted">
            One free meal a day, ladled from whatever the pot decided to be
            this morning.
          </p>
          <form action={claimMealAction} className="mt-3">
            <IdempotencyField />
            <SubmitButton pendingLabel="Ladling…">
              Claim today&apos;s meal
            </SubmitButton>
          </form>
        </>
      ) : (
        <p className="text-sm text-text-muted">
          The kitchen is closed today. The pot apologizes. Nothing is lost —
          your companion is perfectly fine without it.
        </p>
      )}
    </ActivitySection>
  );
}
