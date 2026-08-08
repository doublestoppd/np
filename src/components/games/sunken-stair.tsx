"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import {
  beginDelveAction,
  chooseDoorAction,
  type CaveActionState,
} from "@/server/actions/cave";
import { coinsFromJSON } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Surface } from "@/components/ui/surface";

/**
 * The Sunken Stair (ADR-59).
 *
 * Ten rooms, two doors each, one descent a day. The client holds nothing
 * but what it has been told: the room it is in, the two labels on the
 * doors, and the steps already taken. It is never sent the answer to a
 * room it has not opened — there is nothing here to read out of a network
 * response, because nothing here knows.
 *
 * Mobile-first at 360px: the two doors are full-width stacked buttons, not
 * a row, because a door label is a sentence and two sentences side by side
 * on a phone is two columns of one word each.
 */

const INITIAL: CaveActionState = {
  view: null,
  step: null,
  error: null,
  coinsAwarded: "0",
  prizeName: null,
  nonce: 0,
};

/** How long the outcome of a room is held before the next one is offered. */
const REVEAL_MS = 1_400;

export function SunkenStair({ initial }: { initial: CaveActionState["view"] }) {
  const [state, dispatch, pending] = useActionState<CaveActionState, FormData>(
    chooseDoorAction,
    { ...INITIAL, view: initial },
  );
  const [beginState, beginDispatch, beginning] = useActionState(
    beginDelveAction,
    { ...INITIAL, view: initial },
  );

  // Whichever action spoke last wins. Both carry the whole delve, so there
  // is no merging to do — only a choice of which response is newer.
  const view =
    beginState.nonce > state.nonce ? beginState.view : (state.view ?? initial);
  const error = beginState.nonce > state.nonce ? beginState.error : state.error;

  /**
   * The step being read before the next room appears.
   *
   * Without it a correct answer swapped the room out from under the
   * player at the moment they were told they had got it right, so the one
   * sentence the room exists to deliver was on screen for a frame.
   */
  const [reveal, setReveal] = useState<CaveActionState["step"]>(null);
  const handled = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (state.nonce === handled.current || !state.step) return;
    handled.current = state.nonce;
    setReveal(state.step);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setReveal(null), REVEAL_MS);
  }, [state.nonce, state.step]);

  const [idempotencyKey, setKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    // A fresh key per room: the same key twice is a replay, which is the
    // point, but a NEW room is a new request and must not inherit it.
    setKey(crypto.randomUUID());
  }, [state.nonce, beginState.nonce]);

  if (!view) return null;

  const choose = (door: 0 | 1, depth: number) => {
    const data = new FormData();
    data.set("depth", String(depth));
    data.set("door", String(door));
    data.set("idempotencyKey", idempotencyKey);
    startTransition(() => dispatch(data));
  };

  const earned = coinsFromJSON(view.coinsEarned);
  const busy = pending || beginning;

  return (
    <div>
      {error && (
        <InlineNotice tone="warning" className="mb-3">
          {error}
        </InlineNotice>
      )}

      {/* ---- The way in --------------------------------------------- */}
      {view.status === "NOT_STARTED" && (
        <div>
          <p className="max-w-prose text-sm text-text-muted">
            Ten rooms down, and two ways on out of every one. One of them
            carries on and one of them does not, and there is no telling
            which from the doorway. Caches at every second room, and
            whatever is at the bottom is at the bottom.
          </p>
          <p className="mt-2 max-w-prose text-sm text-text-muted">
            Take a wrong door and you are seen off for the day — but you
            keep every coin you found on the way down. Nothing here takes
            anything back.
          </p>
          <p className="mt-2 text-sm text-text-muted">
            The caches hold <CurrencyAmount amount={coinsFromJSON(view.onOffer)} />{" "}
            between them, all told.
          </p>
          <div className="mt-3">
            <Button
              type="button"
              disabled={busy}
              onClick={() => startTransition(() => beginDispatch())}
            >
              {beginning ? "Going in…" : "Go down"}
            </Button>
          </div>
        </div>
      )}

      {/* ---- What has happened so far -------------------------------- */}
      {view.steps.length > 0 && (
        <ol className="mb-3 flex flex-col gap-2">
          {view.steps.map((step) => (
            <li
              key={step.depth}
              className={[
                "rounded-control border px-3 py-2 text-sm",
                step.correct
                  ? "border-border bg-surface"
                  : "border-border-strong bg-surface-sunken",
              ].join(" ")}
            >
              <p className="font-medium text-text">
                <span className="text-text-muted tabular-nums">
                  {step.depth}.
                </span>{" "}
                {step.roomName}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {step.doorLabel}
              </p>
              <p className="mt-1 text-text-muted">{step.flavor}</p>
              {/* No coin glyph of our own: CurrencyAmount draws one, and
                  two side by side reads as a typo. */}
              {coinsFromJSON(step.coins) > 0n && (
                <p className="mt-1 text-text">
                  <CurrencyAmount amount={coinsFromJSON(step.coins)} /> here.
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* ---- The room in front of you -------------------------------- */}
      {view.status === "IN_PROGRESS" && view.current && (
        <Surface className="mt-3">
          <h3 className="font-display text-base font-semibold text-text">
            <span className="text-text-muted tabular-nums">
              {view.current.depth}.
            </span>{" "}
            {view.current.name}
          </h3>
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            {view.current.description}
          </p>
          {/* Held while the last room is still being read. Offering the
              next choice immediately means the sentence the player just
              earned is on screen for one frame. */}
          <div className="mt-3 flex flex-col gap-2">
            {view.current.doors.map((label, index) => (
              <Button
                key={label}
                type="button"
                variant="secondary"
                disabled={busy || reveal !== null}
                onClick={() =>
                  choose(index === 1 ? 1 : 0, view.current?.depth ?? 1)
                }
                className="w-full justify-start text-left"
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {view.depth} of {view.totalDepth} rooms behind you.
          </p>
        </Surface>
      )}

      {/* ---- How it ended -------------------------------------------- */}
      {view.status === "TURNED_BACK" && (
        <InlineNotice tone="info" className="mt-3">
          <strong>Back out into the daylight.</strong> That is your one go
          today — the doors sit differently tomorrow, and nothing about
          today carries over.
          {earned > 0n && (
            <>
              {" "}
              You kept <CurrencyAmount amount={earned} />.
            </>
          )}
        </InlineNotice>
      )}

      {view.status === "CLEARED" && (
        <InlineNotice tone="success" className="mt-3">
          <strong>All the way down.</strong> <CurrencyAmount amount={earned} />{" "}
          out of the caches
          {view.prize && <> and {view.prize.name} out of the hoard</>}.
        </InlineNotice>
      )}

      {view.status !== "NOT_STARTED" && (
        <p className="mt-3 text-xs text-text-muted">
          One descent a day, and the doors are drawn fresh for every player
          every morning — nobody else&apos;s cave is yours.
        </p>
      )}

      {/* The steps list is the visible record; this is the same thing for
          anybody not looking at it. */}
      <p role="status" aria-live="polite" className="sr-only">
        {reveal
          ? `${reveal.roomName}. ${reveal.flavor} ${
              coinsFromJSON(reveal.coins) > 0n
                ? `${reveal.coins} coins found here.`
                : ""
            }`
          : ""}
      </p>
    </div>
  );
}
