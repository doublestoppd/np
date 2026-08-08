import { prisma } from "@/server/db";
import { getLookHereView } from "@/server/modules/daily/lantern/queries";
import { lookForLanternAction } from "@/server/actions/lantern";
import { LANTERN_NAME } from "@/server/modules/daily/lantern/config";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Surface } from "@/components/ui/surface";
import type { LocationPageContext } from "./types";

/**
 * "Look for the lantern here", on every location page.
 *
 * This is NOT a location activity attachment, and that is deliberate. An
 * attachment says what is hosted *at* a place; the hunt is available
 * everywhere, so attaching it would mean listing it on all fifteen
 * locations and remembering to do so for every location ever added. Miss
 * one and the lantern could hide somewhere the player has no way to
 * search — a bug the content author would never see. Rendering it from
 * the page shell instead makes the searchable set and the hideable set
 * the same set by construction.
 *
 * It renders below the attachments and stays visually quieter than them:
 * it is a thing you can do anywhere, not the reason you came.
 */
export async function LanternLookPanel({
  location,
  viewerId,
  notice,
}: {
  location: LocationPageContext;
  viewerId: string;
  /**
   * What the last look here found, if this render followed one.
   *
   * Carried on its own query key and rendered HERE rather than in the
   * page's banner. The banner is at the top and this card is at the
   * bottom, so a shared key answered "is it here?" a whole screen away
   * from the button that asked — above the sudoku grid, on the sudoku
   * page.
   */
  notice?: string;
}) {
  const view = await getLookHereView(prisma, {
    userId: viewerId,
    locationId: location.id,
  });

  // No early return when the day's hunt has not been drawn yet: the look
  // action draws it, so this stays a pure read and the button still works
  // for a player who reaches a location before visiting the notice board.

  const body =
    view.status === "FOUND" ? (
      <p className="text-sm text-text-muted">
        You&apos;ve already found {LANTERN_NAME.toLowerCase()} today. It turns
        up somewhere else after the reset at midnight GST.
      </p>
    ) : view.status === "OUT_OF_LOOKS" ? (
      <p className="text-sm text-text-muted">
        You&apos;ve used today&apos;s three looks. Nothing carries over and
        nothing is lost — a fresh three arrive at midnight GST.
      </p>
    ) : view.lookedHere ? (
      <p className="text-sm text-text-muted">
        You already looked here today. It hasn&apos;t moved since — try
        somewhere the note fits better.
      </p>
    ) : (
      <form action={lookForLanternAction} className="flex flex-col gap-2">
        <input type="hidden" name="locationId" value={location.id} />
        {/* Looking leaves you where you were standing. */}
        <input type="hidden" name="returnTo" value={location.path} />
        <IdempotencyField />
        <p className="text-sm text-text-muted">
          {view.looksRemaining === 1
            ? "One look left today"
            : `${view.looksRemaining} looks left today`}
          . A find here pays <CurrencyAmount amount={BigInt(view.nextReward)} />
          .
        </p>
        <SubmitButton variant="secondary" pendingLabel="Looking…">
          Look for the lantern here
        </SubmitButton>
      </form>
    );

  return (
    <Surface as="section" aria-labelledby="lantern-look-here" className="mt-4">
      <h2 id="lantern-look-here" className="text-sm font-medium text-text">
        <span aria-hidden="true">🏮</span> {LANTERN_NAME}
      </h2>
      {/* The tone comes from the hunt's own state rather than from
          matching words in the message. Sniffing the copy would mean a
          reworded notice silently losing its colour, and the query string
          is player-editable in any case. */}
      {notice && (
        <InlineNotice
          tone={view.status === "FOUND" ? "success" : "info"}
          className="mt-2"
        >
          {notice}
        </InlineNotice>
      )}
      <div className="mt-2">{body}</div>
    </Surface>
  );
}
