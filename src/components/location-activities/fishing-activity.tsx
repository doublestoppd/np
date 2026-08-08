import { prisma } from "@/server/db";
import { getFishingSpotView } from "@/server/modules/fishing/queries";
import { castLineAction } from "@/server/actions/fishing";
import { ItemArt } from "@/components/art/item-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * A fishing spot as a location activity. The rules live in
 * modules/fishing; this loads the view model and renders one button.
 *
 * What lives here, and how big it runs, is deliberately not shown. A
 * player learns a water by fishing it, and printing the table would
 * replace the activity with reading a table — the same rule the forage
 * spots follow.
 */
export async function FishingLocationActivity({
  attachment,
  location,
  viewer,
}: LocationActivityRendererProps) {
  const view = await getFishingSpotView(prisma, {
    userId: viewer.id,
    spotSlug: attachment.activityKey,
  });
  if (!view) {
    throw new Error(`fishing spot "${attachment.activityKey}" not found`);
  }

  const status: { status: PlayerStatus; label: string } = !view.available
    ? { status: "UNAVAILABLE", label: "Nothing rising" }
    : view.remainingToday === 0
      ? { status: "COMPLETED", label: "Fished out today" }
      : view.castsToday > 0
        ? { status: "IN_PROGRESS", label: `${view.remainingToday} casts left` }
        : { status: "AVAILABLE", label: "Available today" };

  return (
    <ActivitySection
      headingId={`activity-fishing-${view.spotSlug}`}
      title={view.name}
      description={view.description}
      status={status}
    >
      {view.available && view.remainingToday > 0 ? (
        <form action={castLineAction}>
          <input type="hidden" name="spotSlug" value={view.spotSlug} />
          {/* Casting leaves you where you were standing. */}
          <input type="hidden" name="returnTo" value={location.path} />
          <IdempotencyField />
          <SubmitButton pendingLabel="Waiting…">Cast a line</SubmitButton>
        </form>
      ) : view.available ? (
        <p className="max-w-prose text-sm text-text-muted">
          That&apos;s your fishing done for today. The water will still be
          here after the reset at midnight UTC — nothing is lost by stopping.
        </p>
      ) : (
        <p className="max-w-prose text-sm text-text-muted">
          Nothing is rising here just now. It will come back on its own.
        </p>
      )}

      {view.todaysCatches.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-text">Landed here today</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {view.todaysCatches.map((catchRow, index) => (
              <li
                key={`${catchRow.itemSlug}-${index}`}
                className="flex items-center gap-2 rounded-control border border-border bg-surface px-2 py-1.5"
              >
                <ArtworkFrame aspect="square" className="w-8 shrink-0">
                  <ItemArt artKey={catchRow.itemArtKey} label="" />
                </ArtworkFrame>
                <span className="text-xs">
                  {catchRow.itemName}
                  <span className="block tabular-nums text-text-muted">
                    {catchRow.lengthCm}cm
                  </span>
                </span>
                {/* Your own record, and never anyone else's — the game has
                    no comparison to make here and must not grow one. */}
                {catchRow.personalBest && <Badge tone="accent">Best</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </ActivitySection>
  );
}
