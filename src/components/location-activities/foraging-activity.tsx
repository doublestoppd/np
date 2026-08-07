import { prisma } from "@/server/db";
import { getSpotView } from "@/server/modules/foraging/queries";
import { searchSpotAction } from "@/server/actions/foraging";
import { ItemArt } from "@/components/art/item-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * A foraging spot as a location activity. The rules live in
 * modules/foraging; this component loads the view model and renders the
 * one button.
 *
 * What the spot can yield is deliberately not shown. A player learns a
 * place by searching it, and printing the loot table would replace that
 * with reading a table.
 */
export async function ForagingLocationActivity({
  attachment,
  viewer,
}: LocationActivityRendererProps) {
  const view = await getSpotView(prisma, {
    userId: viewer.id,
    spotSlug: attachment.activityKey,
  });
  if (!view) {
    throw new Error(`forage spot "${attachment.activityKey}" not found`);
  }

  const status: { status: PlayerStatus; label: string } = !view.available
    ? { status: "UNAVAILABLE", label: "Nothing growing" }
    : view.remainingToday === 0
      ? { status: "COMPLETED", label: "Searched today" }
      : view.searchedToday > 0
        ? {
            status: "IN_PROGRESS",
            label: `${view.remainingToday} left today`,
          }
        : { status: "AVAILABLE", label: "Available today" };

  return (
    <ActivitySection
      headingId={`activity-foraging-${view.spotSlug}`}
      title={view.name}
      description={view.description}
      status={status}
    >
      {view.available && view.remainingToday > 0 ? (
        <form action={searchSpotAction}>
          <input type="hidden" name="spotSlug" value={view.spotSlug} />
          <IdempotencyField />
          <SubmitButton pendingLabel="Looking…">
            Have a look around
          </SubmitButton>
        </form>
      ) : view.available ? (
        <p className="max-w-prose text-sm text-text-muted">
          You&apos;ve had a good look around for today. Whatever grows back
          will be here after the reset at midnight UTC — nothing is lost by
          leaving it.
        </p>
      ) : (
        <p className="max-w-prose text-sm text-text-muted">
          Nothing is growing here just now. It will come back on its own.
        </p>
      )}

      {view.todaysFinds.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-text">Found here today</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {view.todaysFinds.map((find, index) => (
              <li
                key={`${find.itemSlug}-${index}`}
                className="flex items-center gap-2 rounded-control border border-border bg-surface px-2 py-1.5"
              >
                <ArtworkFrame aspect="square" className="w-8 shrink-0">
                  <ItemArt
                    artKey={find.itemArtKey}
                    categorySlug={find.itemCategorySlug ?? undefined}
                    label=""
                  />
                </ArtworkFrame>
                <span className="text-xs">
                  {find.itemName}
                  {find.quantity > 1 ? ` ×${find.quantity}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ActivitySection>
  );
}
