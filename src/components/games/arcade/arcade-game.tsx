"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ArcadeGame as ArcadeGameKey } from "@prisma/client";
import {
  claimArcadeRunAction,
  startArcadeRunAction,
  submitArcadeRunAction,
  type ArcadeClaimState,
  type ArcadeStartState,
  type ArcadeSubmitState,
} from "@/server/actions/arcade";
import type { PendingClaim } from "@/server/modules/games/arcade/run";
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
 *
 * **Ending a run and being paid for it are two different events** (ADR-64).
 * The run is scored and recorded automatically — your own best counts every
 * go you take — and then the player decides whether to spend one of the
 * day's three claims on it. The figure on the button is the server's, so
 * the decision is made against the real number rather than a guess. Going
 * again gives the offer up, which is what makes it a decision.
 */

const START: ArcadeStartState = {
  runId: null,
  seed: null,
  error: null,
  nonce: 0,
};
const SUBMIT: ArcadeSubmitState = {
  score: null,
  runId: null,
  coinsOffered: "0",
  claimable: false,
  claimsUsed: 0,
  personalBest: false,
  error: null,
  nonce: 0,
};
const CLAIM: ArcadeClaimState = {
  coinsAwarded: "0",
  claimsUsed: 0,
  runId: null,
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
  /** How the game is controlled. */
  control?: "tap" | "lean" | "compass";
  /** What the player is scoring, e.g. ["wall", "walls"]. */
  unit: [string, string];
  /** How to play, in one line. */
  howTo: string;
  claimsUsed: number;
  claimsPerDay: number;
  coinsToday: string;
  bestEver: number;
  /** A run finished but not yet taken, recovered across a reload. */
  pending: PendingClaim | null;
}

export function ArcadeGame<TState>({
  game,
  sim,
  width,
  height,
  draw,
  control = "tap",
  unit,
  howTo,
  claimsUsed: claimsUsedInitial,
  claimsPerDay,
  coinsToday,
  bestEver: bestEverInitial,
  pending,
}: ArcadeGameProps<TState>) {
  const [start, startDispatch, starting] = useActionState(
    startArcadeRunAction,
    START,
  );
  const [result, submitDispatch, submitting] = useActionState(
    submitArcadeRunAction,
    SUBMIT,
  );
  const [claim, claimDispatch, claiming] = useActionState(
    claimArcadeRunAction,
    CLAIM,
  );

  const [idempotencyKey, setKey] = useState(() => crypto.randomUUID());
  const [claimKey, setClaimKey] = useState(() => crypto.randomUUID());
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
  // The claim gets its own for the same reason — a double-tapped "Take"
  // must return the first payment, not make a second one.
  useEffect(() => {
    setKey(crypto.randomUUID());
    setClaimKey(crypto.randomUUID());
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

  // The freshest count wins: a claim moves it, and before that a submit
  // reports what the server saw.
  const claimsUsed =
    claim.runId !== null
      ? claim.claimsUsed
      : result.score !== null
        ? result.claimsUsed
        : claimsUsedInitial;
  const claimsLeft = Math.max(0, claimsPerDay - claimsUsed);
  const bestEver = Math.max(bestEverInitial, result.score ?? 0);
  const awarded = coinsFromJSON(claim.coinsAwarded);
  const noRun = !start.runId;

  // The offer standing right now: the run just finished, or — before any
  // run this visit — one recovered from a previous one.
  const offer: PendingClaim | null =
    result.score !== null && result.runId !== null
      ? result.claimable
        ? {
            runId: result.runId,
            score: result.score,
            coins: result.coinsOffered,
          }
        : null
      : pending;
  // Retired the moment it is taken, so the button cannot be pressed twice
  // into an error it has already succeeded at.
  const takeable = offer && offer.runId !== claim.runId ? offer : null;

  const askForRun = () => {
    const data = new FormData();
    data.set("game", game);
    startTransition(() => startDispatch(data));
  };

  const takeCoins = (runId: string) => {
    const data = new FormData();
    data.set("runId", runId);
    data.set("idempotencyKey", claimKey);
    startTransition(() => claimDispatch(data));
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
      {claim.error && (
        <InlineNotice tone="warning" className="mb-3">
          {claim.error}
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
          {/* A run finished last visit and never taken. Offered rather than
              quietly dropped: closing a tab while deciding should not cost
              the coins, and going again is the only thing that gives them
              up (ADR-64). */}
          {takeable && (
            <InlineNotice tone="info" className="mb-3">
              Your last go reached{" "}
              <strong>
                {takeable.score} {takeable.score === 1 ? unit[0] : unit[1]}
              </strong>
              , and you haven&apos;t taken it yet. It&apos;s still yours until
              you go again.
              <div className="mt-2">
                <Button
                  type="button"
                  onClick={() => takeCoins(takeable.runId)}
                  disabled={claiming}
                >
                  {claiming ? (
                    "Taking…"
                  ) : (
                    <>
                      Take{" "}
                      <CurrencyAmount amount={coinsFromJSON(takeable.coins)} />
                    </>
                  )}
                </Button>
              </div>
            </InlineNotice>
          )}
          {claim.runId !== null && awarded > 0n && (
            <InlineNotice tone="success" className="mb-3">
              <CurrencyAmount amount={awarded} /> taken. {claimsLeft} of{" "}
              {claimsPerDay} claims left today.
            </InlineNotice>
          )}
          <Button
            type="button"
            onClick={askForRun}
            disabled={starting}
            variant={takeable ? "secondary" : "primary"}
          >
            {starting
              ? "Getting ready…"
              : takeable
                ? "Go again instead"
                : "Have a go"}
          </Button>
          {claimsLeft === 0 && (
            <p className="mt-2 max-w-prose text-sm text-text-muted">
              Today&apos;s three claims are spent, so nothing more pays out
              until tomorrow. Playing carries on regardless — there is no limit
              on that, and never will be.
            </p>
          )}
        </div>
      ) : (
        <div className="arcade-surface mt-4">
          <ArcadeStage
            // Remounted per run, which resets the stage's own idea of
            // which way you are leaning. Without it, a direction still
            // held when the last run ended is deduped away on the first
            // input of the next one — the same silent-swallow shape as
            // the queued-input bug, one layer up.
            key={start.runId ?? "none"}
            control={control}
            width={width}
            height={height}
            draw={(ctx) => draw(ctx, loop.state, loop.phase)}
            onPrimary={() => loop.input(1)}
            onSteer={
              control === "lean"
                ? (d) =>
                    // 3 is "let go". It cannot be 0: the trace codec spends
                    // 0 on "nothing happened this tick", so a release sent
                    // as 0 is indistinguishable from silence and the lean
                    // never clears.
                    loop.input(d === -1 ? 1 : d === 1 ? 2 : 3)
                : undefined
            }
            onDirection={
              control === "compass" ? (d) => loop.input(d) : undefined
            }
            label={
              control === "lean"
                ? "Climb. Hold the left or right half to lean, or hold the arrow keys."
                : control === "compass"
                  ? "Turn. Swipe or tap the side you want to go, or use the arrow keys."
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
                  tone={
                    claim.runId === result.runId && awarded > 0n
                      ? "success"
                      : "info"
                  }
                  className="mb-3"
                >
                  <strong>
                    {result.score} {result.score === 1 ? unit[0] : unit[1]}.
                  </strong>{" "}
                  {claim.runId === result.runId && awarded > 0n ? (
                    <>
                      <CurrencyAmount amount={awarded} /> taken for it.
                    </>
                  ) : takeable ? (
                    // The decision. The figure is the server's own, so
                    // "is this worth a claim?" is answered against the
                    // real number rather than a guess (ADR-64).
                    <>
                      Worth{" "}
                      <CurrencyAmount amount={coinsFromJSON(takeable.coins)} />{" "}
                      if you take it. You have {claimsLeft} of {claimsPerDay}{" "}
                      claims left today, and going again gives this one up.
                    </>
                  ) : claimsLeft === 0 ? (
                    <>
                      Today&apos;s three claims are spent, so this one is for
                      the record only — keep playing as long as you like.
                    </>
                  ) : (
                    <>Not far enough to be worth a claim. Go again.</>
                  )}
                  {result.personalBest && result.score > 0 && (
                    <> Best you have managed yet.</>
                  )}
                </InlineNotice>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {takeable && (
                  <Button
                    type="button"
                    onClick={() => takeCoins(takeable.runId)}
                    disabled={claiming || starting}
                  >
                    {claiming ? (
                      "Taking…"
                    ) : (
                      <>
                        Take{" "}
                        <CurrencyAmount
                          amount={coinsFromJSON(takeable.coins)}
                        />
                      </>
                    )}
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={askForRun}
                  disabled={starting || submitting || claiming}
                  variant={takeable ? "secondary" : "primary"}
                >
                  {starting
                    ? "Getting ready…"
                    : takeable
                      ? "Go again instead"
                      : "Again"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
