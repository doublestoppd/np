"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { ArcadeGame as ArcadeGameKey } from "@prisma/client";
import {
  startArcadeRunAction,
  submitArcadeRunAction,
  type ArcadeStartState,
  type ArcadeSubmitState,
} from "@/server/actions/arcade";
import type { ArcadeSim } from "@/lib/games/arcade/core";
import { coinsFromJSON } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { InlineNotice } from "@/components/ui/inline-notice";
import { ArcadeStage } from "./arcade-stage";
import { useArcadeLoop } from "./use-arcade-loop";

/**
 * The shell both arcade games sit in (ADR-62).
 *
 * Owns the whole round-trip — asking the server for a run, playing it,
 * submitting the trace, showing what the server made of it — so a game is
 * a simulation, a draw function and nothing else.
 *
 * **The score on screen during play is the client's own simulation, and it
 * is not what gets paid.** When the run ends the server replays the trace
 * and its answer replaces the displayed one. On an honest run they are the
 * same number, which is the point of the whole design; the copy below
 * never promises a payout before the server has spoken.
 */

const START: ArcadeStartState = { runId: null, seed: null, error: null, nonce: 0 };
const SUBMIT: ArcadeSubmitState = {
  score: null,
  coinsAwarded: "0",
  unpaid: false,
  claimsUsed: 0,
  personalBest: false,
  error: null,
  nonce: 0,
};

export interface ArcadeGameProps<TState> {
  game: ArcadeGameKey;
  sim: ArcadeSim<TState>;
  /** Logical stage size. */
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, state: TState, phase: string) => void;
  /** True when this game steers rather than taps. */
  steers?: boolean;
  /** What the player is scoring, e.g. ["wall", "walls"]. */
  unit: [string, string];
  /** How to play, in one line. */
  howTo: string;
  claimsUsed: number;
  claimsPerDay: number;
  coinsToday: string;
  bestEver: number;
}

export function ArcadeGame<TState>({
  game,
  sim,
  width,
  height,
  draw,
  steers = false,
  unit,
  howTo,
  claimsUsed: claimsUsedInitial,
  claimsPerDay,
  coinsToday,
  bestEver: bestEverInitial,
}: ArcadeGameProps<TState>) {
  const [start, startDispatch, starting] = useActionState(
    startArcadeRunAction,
    START,
  );
  const [result, submitDispatch, submitting] = useActionState(
    submitArcadeRunAction,
    SUBMIT,
  );

  const [idempotencyKey, setKey] = useState(() => crypto.randomUUID());
  const submitted = useRef(0);

  const seed = start.seed ?? "";
  const loop = useArcadeLoop<TState>({
    sim,
    seed,
    onEnd: (trace) => {
      if (!start.runId) return;
      const data = new FormData();
      data.set("runId", start.runId);
      data.set("trace", trace);
      data.set("idempotencyKey", idempotencyKey);
      startTransition(() => submitDispatch(data));
    },
  });

  // A fresh key per run: the same key twice is a replay, which is what we
  // want for a double-tapped submit, but a NEW run must not inherit it.
  useEffect(() => {
    setKey(crypto.randomUUID());
  }, [start.nonce]);

  // A run arriving from the server is the cue to reset the stage. Guarded
  // by the nonce so an unrelated re-render cannot restart a run in flight
  // — the replay-on-rerender bug this codebase has hit more than once.
  useEffect(() => {
    if (!start.runId || start.nonce === submitted.current) return;
    submitted.current = start.nonce;
    loop.restart();
    // `loop` is recreated every render; depending on it would defeat the
    // guard above, which is the thing keeping this from re-firing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.runId, start.nonce]);

  const claimsUsed = result.score !== null ? result.claimsUsed : claimsUsedInitial;
  const claimsLeft = Math.max(0, claimsPerDay - claimsUsed);
  const bestEver = Math.max(bestEverInitial, result.score ?? 0);
  const awarded = coinsFromJSON(result.coinsAwarded);
  const noRun = !start.runId;

  const askForRun = () => {
    const data = new FormData();
    data.set("game", game);
    startTransition(() => startDispatch(data));
  };

  return (
    <div>
      {start.error && (
        <InlineNotice tone="warning" className="mb-3">
          {start.error}
        </InlineNotice>
      )}
      {result.error && (
        <InlineNotice tone="warning" className="mb-3">
          {result.error}
        </InlineNotice>
      )}

      <p className="max-w-prose text-sm text-text-muted">{howTo}</p>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <div className="flex gap-1">
          <dt className="text-text-muted">Claims left today</dt>
          <dd className="font-medium tabular-nums text-text">
            {claimsLeft} of {claimsPerDay}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-text-muted">Earned today</dt>
          <dd className="font-medium text-text">
            <CurrencyAmount amount={coinsFromJSON(coinsToday) + awarded} />
          </dd>
        </div>
        {bestEver > 0 && (
          <div className="flex gap-1">
            {/* Your own, and only ever your own — the game never ranks one
                player against another (CLAUDE.md). */}
            <dt className="text-text-muted">Your best</dt>
            <dd className="font-medium tabular-nums text-text">
              {bestEver} {bestEver === 1 ? unit[0] : unit[1]}
            </dd>
          </div>
        )}
      </dl>

      {noRun ? (
        <div className="mt-4">
          <Button type="button" onClick={askForRun} disabled={starting}>
            {starting ? "Getting ready…" : "Have a go"}
          </Button>
          {claimsLeft === 0 && (
            <p className="mt-2 max-w-prose text-sm text-text-muted">
              Today&apos;s three claims are spent, so nothing more pays out
              until tomorrow. Playing carries on regardless — there is no
              limit on that, and never will be.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <ArcadeStage
            // Remounted per run, which resets the stage's own idea of
            // which way you are leaning. Without it, a direction still
            // held when the last run ended is deduped away on the first
            // input of the next one — the same silent-swallow shape as
            // the queued-input bug, one layer up.
            key={start.runId ?? "none"}
            width={width}
            height={height}
            draw={(ctx) => draw(ctx, loop.state, loop.phase)}
            onPrimary={() => loop.input(1)}
            onSteer={
              steers
                ? (d) =>
                    // 3 is "let go". It cannot be 0: the trace codec spends
                    // 0 on "nothing happened this tick", so a release sent
                    // as 0 is indistinguishable from silence and the lean
                    // never clears.
                    loop.input(d === -1 ? 1 : d === 1 ? 2 : 3)
                : undefined
            }
            label={
              steers
                ? "Climb. Hold the left or right half to lean, or hold the arrow keys."
                : "Fly. Tap anywhere, or press space, to beat once."
            }
            status={
              loop.phase === "OVER"
                ? `Run over at ${loop.score} ${loop.score === 1 ? unit[0] : unit[1]}.`
                : `${loop.score} ${loop.score === 1 ? unit[0] : unit[1]}.`
            }
          />

          <p className="mt-2 text-center text-lg font-semibold tabular-nums text-text">
            {loop.score}{" "}
            <span className="text-sm font-normal text-text-muted">
              {loop.score === 1 ? unit[0] : unit[1]}
            </span>
          </p>

          {loop.phase === "OVER" && (
            <div className="mt-3">
              {submitting ? (
                <p className="text-sm text-text-muted">Scoring…</p>
              ) : result.score !== null ? (
                <InlineNotice
                  tone={awarded > 0n ? "success" : "info"}
                  className="mb-3"
                >
                  <strong>
                    {result.score} {result.score === 1 ? unit[0] : unit[1]}.
                  </strong>{" "}
                  {awarded > 0n ? (
                    <>
                      <CurrencyAmount amount={awarded} /> for it.
                    </>
                  ) : result.unpaid && claimsLeft === 0 ? (
                    <>
                      That is today&apos;s three claims spent — keep playing
                      as long as you like, it simply stops paying.
                    </>
                  ) : (
                    <>Not far enough to pay this time. Go again.</>
                  )}
                  {result.personalBest && result.score > 0 && (
                    <> Best you have managed yet.</>
                  )}
                </InlineNotice>
              ) : null}
              <Button type="button" onClick={askForRun} disabled={starting || submitting}>
                {starting ? "Getting ready…" : "Again"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
