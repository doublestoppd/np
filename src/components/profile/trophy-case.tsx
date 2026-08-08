"use client";

import { useState } from "react";
import type { TrophyView } from "@/server/modules/trophies/trophies";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SectionHeading } from "@/components/ui/section-heading";

/**
 * A player's trophies (ADR-65).
 *
 * The same component on both profiles, because they are the same thing
 * seen from two sides: your own case shows what you have and what else
 * there is, and somebody else's shows only what they have earned. The
 * difference is entirely in the data — `unearned` is empty on a public
 * profile, so this cannot leak it by accident.
 *
 * **Every trophy opens.** Earned or not, yours or a stranger's, tapping
 * one says what it takes and — if it has been earned — when. A locked
 * trophy that will not tell you what it wants is a puzzle nobody asked
 * for, and a stranger's trophy you cannot identify is decoration.
 *
 * ORDERED by activity — all the daily things together, then gathering,
 * then the puzzles — with the group named in the detail dialog rather
 * than as a heading over every few tiles. At 360px a heading per group
 * would be more heading than trophy.
 *
 * Never counted. There is no "18 of 27" here and no progress bar: a case
 * is a record of things done, not a chart of things outstanding
 * (docs/design-philosophy.md).
 */

const EARNED_FORMAT = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
});

export function TrophyCase({
  earned,
  unearned,
  ownerLabel,
}: {
  earned: TrophyView[];
  unearned: TrophyView[];
  /** How to name the holder in copy. "You" on your own profile. */
  ownerLabel: string;
}) {
  const [open, setOpen] = useState<TrophyView | null>(null);
  const mine = ownerLabel === "You";

  return (
    <>
      <SectionHeading id="trophies-heading">Trophies</SectionHeading>

      {earned.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">
          {mine
            ? "None yet. They are meant to take a while — have a look at what is going below."
            : `${ownerLabel} hasn't earned any yet.`}
        </p>
      ) : (
        <>
          {mine && (
            <p className="mt-2 text-sm text-text-muted">Earned so far.</p>
          )}
          <TrophyGrid trophies={earned} onOpen={setOpen} />
        </>
      )}

      {unearned.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-sm font-semibold text-text">
            Still out there
          </h3>
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            Everything else there is to earn. Tap any of them to see what it
            takes — and there is no hurry, because none of these expire.
          </p>
          <TrophyGrid trophies={unearned} onOpen={setOpen} />
        </div>
      )}

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        labelledBy="trophy-detail-heading"
      >
        {open && (
          <div className="p-5">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="text-3xl leading-none">
                {open.icon}
              </span>
              <div className="min-w-0">
                <h2
                  id="trophy-detail-heading"
                  className="font-display text-lg font-semibold text-text"
                >
                  {open.name}
                </h2>
                <p className="text-sm text-text-muted">{open.groupName}</p>
              </div>
            </div>

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-medium text-text">What it takes</dt>
                <dd className="mt-1 text-text-muted">{open.criteria}</dd>
              </div>
              <div>
                <dt className="font-medium text-text">Earned</dt>
                <dd className="mt-1 text-text-muted">
                  {open.earnedAt
                    ? EARNED_FORMAT.format(open.earnedAt)
                    : mine
                      ? "Not yet."
                      : `${ownerLabel} hasn't earned this one.`}
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(null)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function TrophyGrid({
  trophies,
  onOpen,
}: {
  trophies: TrophyView[];
  onOpen: (trophy: TrophyView) => void;
}) {
  return (
    <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
      {trophies.map((trophy) => (
        <li key={trophy.key}>
          <button
            type="button"
            onClick={() => onOpen(trophy)}
            // The accessible name carries the state, because the visual
            // cue for an unearned trophy is that it is faded — which is
            // nothing at all to a screen reader.
            aria-label={
              trophy.earnedAt
                ? `${trophy.name}, earned. See what it took.`
                : `${trophy.name}, not yet earned. See what it takes.`
            }
            className={`flex h-full w-full min-h-24 flex-col items-center justify-center gap-1 rounded-control border p-2 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              trophy.earnedAt
                ? "border-border bg-surface hover:bg-accent-soft"
                : "border-dashed border-border bg-surface-sunken hover:bg-surface"
            }`}
          >
            <span
              aria-hidden="true"
              className={`text-2xl leading-none ${
                trophy.earnedAt ? "" : "opacity-35 grayscale"
              }`}
            >
              {trophy.icon}
            </span>
            <span
              className={`text-xs font-medium leading-tight ${
                trophy.earnedAt ? "text-text" : "text-text-muted"
              }`}
            >
              {trophy.name}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
