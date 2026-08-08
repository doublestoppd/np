import { prisma } from "@/server/db";
import { getHuntView } from "@/server/modules/daily/lantern/queries";
import { ensureHuntForUser } from "@/server/modules/daily/lantern/hunt";
import {
  LANTERN_BLURB,
  LANTERN_NAME,
} from "@/server/modules/daily/lantern/config";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { InlineNotice } from "@/components/ui/inline-notice";
import { ActivitySection } from "./activity-section";
import type { LocationActivityRendererProps } from "./types";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * The notice board: where the day's riddle is posted, and the record of
 * where this player has already been.
 *
 * Deliberately has no button. The notice tells you where to think; the
 * looking happens out in the world, at whichever location you decide on
 * (LanternLookPanel, rendered on every location page). A "look here"
 * control on this page as well would let a player brute-force the hunt
 * without leaving it, which is the one thing the hunt is for.
 */
export async function LanternLocationActivity({
  viewer,
}: LocationActivityRendererProps) {
  // Lazy draw: the riddle is this activity's content, so the notice
  // board is where a day that the cron has not reached yet begins. The
  // registry isolates a failure here to this panel.
  await ensureHuntForUser(prisma, viewer.id);
  const hunt = await getHuntView(prisma, { userId: viewer.id });

  const status: { status: PlayerStatus; label: string } =
    hunt.status === "FOUND"
      ? { status: "COMPLETED", label: "Found today" }
      : hunt.status === "OUT_OF_LOOKS"
        ? { status: "COMPLETED", label: "Looked everywhere" }
        : hunt.looksUsed > 0
          ? { status: "IN_PROGRESS", label: `${hunt.looksRemaining} looks left` }
          : { status: "AVAILABLE", label: "Available today" };

  return (
    <ActivitySection
      headingId="activity-lantern"
      title={LANTERN_NAME}
      description={LANTERN_BLURB}
      status={status}
    >
      {hunt.clue === null ? (
        <p className="max-w-prose text-sm text-text-muted">
          The note is blank. Whoever writes it is running late — check back
          shortly.
        </p>
      ) : (
        <>
          <figure className="max-w-prose rounded-control border border-border bg-surface-sunken px-4 py-3">
            <blockquote className="text-sm italic leading-relaxed text-text">
              &ldquo;{hunt.clue}&rdquo;
            </blockquote>
            <figcaption className="mt-2 text-xs text-text-muted">
              Pinned to the door, in the same handwriting as always.
            </figcaption>
          </figure>

          {hunt.status === "FOUND" ? (
            <InlineNotice tone="success" className="mt-3">
              You found it at {hunt.foundAtName} and kept{" "}
              <CurrencyAmount amount={BigInt(hunt.rewardEarned)} /> for the trouble. It
              will be somewhere else after the reset at midnight GST.
            </InlineNotice>
          ) : hunt.status === "OUT_OF_LOOKS" ? (
            <p className="mt-3 max-w-prose text-sm text-text-muted">
              You looked in all three places you fancied and it was in none of
              them. It moves at midnight GST and you start again with a fresh
              three — nothing carries over, including the misses.
            </p>
          ) : (
            <p className="mt-3 max-w-prose text-sm text-text-muted">
              Work out where that is, go there, and look around.{" "}
              {hunt.looksRemaining === 1
                ? "One look left"
                : `${hunt.looksRemaining} looks left`}{" "}
              today, and the next one pays{" "}
              <CurrencyAmount amount={BigInt(hunt.nextReward)} /> if it finds the thing.
            </p>
          )}

          {hunt.looks.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-text">
                Where you&apos;ve looked today
              </h3>
              <ul className="mt-2 space-y-1.5">
                {hunt.looks.map((look, index) => (
                  <li
                    key={`${look.placeName}-${index}`}
                    className="flex flex-wrap items-baseline gap-x-2 text-sm"
                  >
                    <span className="text-text">{look.placeName}</span>
                    <span className="text-xs text-text-muted">
                      {look.found
                        ? "— found it"
                        : look.warmRegion
                          ? `— not here, but right region (${look.regionName})`
                          : `— not here, and not in ${look.regionName}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </ActivitySection>
  );
}
