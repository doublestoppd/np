import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { getShelf } from "@/server/modules/giveaway/queries";
import { FRESHNESS_LABELS } from "@/server/modules/giveaway/config";
import {
  leaveOnShelfAction,
  takeFromShelfAction,
} from "@/server/actions/giveaway";
import { ItemArt } from "@/components/art/item-art";
import { LeaveOnShelfForm } from "@/components/giveaway/leave-on-shelf-form";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { ItemIdentity } from "@/components/ui/item-identity";
import { SubmitButton } from "@/components/ui/submit-button";
import { GIVEAWAY_MAX_QUANTITY } from "@/lib/validation";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * The Leaving Shelf: a plank beside the Mossy Market's counter where
 * people put down what they no longer need, and anybody may take it.
 *
 * It reads like a shop and is priced like a gift, which is the whole joke
 * — and the contrast only works because the paid shelves are three feet
 * away in the same room.
 *
 * Three deliberate absences, all of them things the genre usually gets
 * wrong here. There is no countdown: a lot says how fresh it is, never how
 * long it has left, because a timer over free goods manufactures a
 * scramble over items anybody can also just buy. There is no rarity
 * sorting, no "best on the shelf", and no notification when something good
 * lands — the shelf rewards walking past, not watching. And there is no
 * refresh button, because the honest instruction is "come back later".
 */
export async function GiveawayLocationActivity({
  location,
  viewer,
}: LocationActivityRendererProps) {
  const shelf = await getShelf(prisma, { userId: viewer.id });

  const status: { status: PlayerStatus; label: string } =
    shelf.lots.length === 0
      ? { status: "UNAVAILABLE", label: "Bare" }
      : shelf.takesLeftToday === 0
        ? { status: "COMPLETED", label: "Took your share" }
        : {
            status: "AVAILABLE",
            label: `${shelf.lots.length} ${shelf.lots.length === 1 ? "thing" : "things"} on it`,
          };

  const canTake = shelf.takesLeftToday > 0;

  return (
    <ActivitySection
      headingId="activity-giveaway"
      title="The Leaving Shelf"
      description="A plank by the door. People put down what they've no use for; anybody may take it. Nothing here costs anything."
      status={status}
    >
      {shelf.lots.length === 0 ? (
        <EmptyState
          icon="🪵"
          headingAs="h3"
          title="The shelf is bare"
          description="Nothing on it just now. It fills up and empties again on its own — leave something if you have a spare."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {shelf.lots.map((lot) => (
            <ItemIdentity
              as="li"
              key={lot.id}
              name={lot.itemName}
              href={`/items/${lot.itemSlug}?from=explore:${location.regionSlug}:${location.slug}`}
              art={
                <ItemArt
                  artKey={lot.itemArtKey}
                  categorySlug={lot.itemCategorySlug ?? undefined}
                  label=""
                />
              }
              badges={
                <>
                  {/* Age, never time remaining. */}
                  <Badge>{FRESHNESS_LABELS[lot.freshness]}</Badge>
                  {lot.yours && <Badge tone="accent">Yours</Badge>}
                </>
              }
              meta={[
                lot.itemCategoryName ?? "Miscellany",
                `${lot.remaining} left`,
                `left by ${lot.donorUsername}`,
              ].join(" · ")}
              actionPlacement="inline"
              action={
                lot.yours ? (
                  <span className="text-xs text-text-muted">
                    Waiting for somebody
                  </span>
                ) : lot.alreadyTaken ? (
                  <span className="text-xs text-text-muted">
                    You took one
                  </span>
                ) : canTake ? (
                  <form action={takeFromShelfAction}>
                    <input type="hidden" name="offeringId" value={lot.id} />
                    <input
                      type="hidden"
                      name="returnTo"
                      value={location.path}
                    />
                    <IdempotencyField />
                    <SubmitButton variant="secondary" pendingLabel="Taking…">
                      Take one
                      <span className="sr-only"> — {lot.itemName}</span>
                    </SubmitButton>
                  </form>
                ) : null
              }
            />
          ))}
        </ul>
      )}

      {!canTake && shelf.lots.length > 0 && (
        <p className="mt-4 max-w-prose text-sm text-text-muted">
          You&apos;ve taken your share for today, so the rest is for
          somebody else. There&apos;ll be more after the reset at midnight
          UTC — and nothing here is exclusive to the shelf.
        </p>
      )}

      <div className="mt-6 border-t border-border pt-4">
        <h3 className="font-display text-base font-semibold text-text">
          Leave something
        </h3>
        {shelf.donatable.length === 0 ? (
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            Nothing in your satchel to spare just now.
          </p>
        ) : shelf.donationsLeftToday === 0 ? (
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            You&apos;ve left plenty today. The shelf will take more after
            the reset at midnight GST.
          </p>
        ) : shelf.roomOnShelf === 0 ? (
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            The shelf is full to the edges. Something will come off it
            shortly.
          </p>
        ) : (
          <div className="mt-3">
            <LeaveOnShelfForm
              action={leaveOnShelfAction}
              returnTo={location.path}
              idempotencyKey={randomUUID()}
              donatable={shelf.donatable}
              maxQuantity={GIVEAWAY_MAX_QUANTITY}
            />
          </div>
        )}
      </div>

      <p className="mt-4 max-w-prose text-sm text-text-muted">
        The shelf clears itself. Anything nobody takes within a couple of
        hours has gone back to the wood — so leave what you can spare, and
        take only what you&apos;ll use.
      </p>
    </ActivitySection>
  );
}
