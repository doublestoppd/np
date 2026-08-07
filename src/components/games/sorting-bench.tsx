"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import {
  applyPlacement,
  isLegalPlacement,
  isStuck,
  SHELF_CAPACITY,
  SHELF_COUNT,
  type SortBoard,
  type SortKind,
} from "@/lib/games/sorting-rules";
import {
  startSortingRunAction,
  submitSortingBatchAction,
  type SortingActionState,
} from "@/server/actions/sorting";
import { coinsFromJSON, formatCoins } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { InlineNotice } from "@/components/ui/inline-notice";

/**
 * The Sorting Bench.
 *
 * The board you tap is computed here, by the same rules module the server
 * adjudicates with (src/lib/games/sorting-rules.ts) — so the tap is
 * instant and the two can never disagree about what a placement does.
 * Nothing here is authoritative: placements are batched and submitted,
 * and the server's board replaces this one on every response.
 *
 * The client is never told the deck. It holds a seven-find window: the
 * five this batch may place and two to look ahead at.
 */

const GLYPH: Record<SortKind, string> = {
  rope: "◍",
  tin: "▣",
  glass: "◆",
  cork: "●",
  bone: "▲",
};

const LABEL: Record<SortKind, string> = {
  rope: "rope",
  tin: "tin",
  glass: "glass",
  cork: "cork",
  bone: "bone",
};

/** Paired with the glyph and the name — colour is never the only signal. */
const TONE: Record<SortKind, string> = {
  rope: "bg-[#b98a3c] text-white",
  tin: "bg-[#5f7fa8] text-white",
  glass: "bg-[#7d9a52] text-white",
  cork: "bg-[#a95f4f] text-white",
  bone: "bg-[#8a6ba0] text-white",
};

const INITIAL: SortingActionState = {
  run: null,
  day: null,
  error: null,
  coinsAwarded: "0",
  nonce: 0,
};

export function SortingBench({ initial }: { initial: SortingActionState }) {
  const [started, startAction, starting] = useActionState(
    startSortingRunAction,
    initial,
  );
  const [submitted, submitAction, submitting] = useActionState<
    SortingActionState,
    FormData
  >(submitSortingBatchAction, INITIAL);

  // Whichever response is newer wins. Both actions return the same shape,
  // so "newest nonce" is the whole reconciliation.
  const server = submitted.nonce >= started.nonce ? submitted : started;
  const run = server.run;

  /** Placements made since the last submission, not yet adjudicated. */
  const [pending, setPending] = useState<number[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [seenNonce, setSeenNonce] = useState(0);

  useEffect(() => {
    if (server.nonce === seenNonce) return;
    setSeenNonce(server.nonce);
    setPending([]);
    if (server.error) {
      setAnnouncement(server.error);
      return;
    }
    if (!server.run) return;
    const coins = coinsFromJSON(server.coinsAwarded);
    const ending =
      server.run.status === "COMPLETED"
        ? "Every last thing sorted."
        : server.run.status === "STUCK"
          ? "No shelf can take the next one. Run over."
          : server.run.status === "VOID"
            ? "That run was set aside."
            : "";
    setAnnouncement(
      `Score ${server.run.score}. ${server.run.remaining} left. ${ending}` +
        (coins > 0n ? ` You earned ${formatCoins(coins)} coins.` : ""),
    );
  }, [server, seenNonce]);

  if (!run || run.status !== "IN_PROGRESS") {
    return (
      <div>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
        {server.error && (
          <InlineNotice tone="error" className="mb-3">
            {server.error}
          </InlineNotice>
        )}
        {run && run.status !== "IN_PROGRESS" && (
          <div className="mb-3 rounded-surface border border-accent bg-accent-soft p-4">
            <h3 className="font-display text-base font-semibold">
              {run.status === "COMPLETED"
                ? "The whole lot, sorted"
                : run.status === "VOID"
                  ? "Run set aside"
                  : "Run over"}
            </h3>
            <p className="mt-1 text-sm text-text">Score {run.score}.</p>
            {coinsFromJSON(server.coinsAwarded) > 0n && (
              <p className="mt-1 text-sm text-text">
                <CurrencyAmount
                  amount={coinsFromJSON(server.coinsAwarded)}
                  delta
                />{" "}
                for beating your best today.
              </p>
            )}
          </div>
        )}
        <DayLine state={server} />
        <form action={() => startTransition(() => startAction())} className="mt-3">
          <Button type="submit" disabled={starting} aria-busy={starting}>
            {starting ? "Clearing the bench…" : "Start sorting"}
          </Button>
        </form>
        <p className="mt-3 max-w-prose text-sm text-text-muted">
          Things come up off the flats one at a time. Put each on a shelf.
          Three alike in a row get boxed and taken away, and whatever slides
          together behind them might go too. Fill every shelf with nowhere
          to put the next one and that&apos;s the run.
        </p>
      </div>
    );
  }

  // Fold the un-submitted placements onto the server's board.
  let board: SortBoard = run.board;
  let localScore = run.score;
  for (const [index, shelf] of pending.entries()) {
    const kind = run.window[index];
    if (kind === undefined || !isLegalPlacement(board, shelf)) break;
    const outcome = applyPlacement(board, kind, shelf);
    board = outcome.board;
    localScore += outcome.scored;
  }

  const inHand = run.window[pending.length];
  const preview = run.window.slice(pending.length + 1, pending.length + 3);
  const batchFull = pending.length >= run.batchLimit;
  const noRoom = isStuck(board);
  const mustSubmit = batchFull || noRoom || inHand === undefined;

  const place = (shelf: number) => {
    if (mustSubmit || submitting || !isLegalPlacement(board, shelf)) return;
    setPending((current) => [...current, shelf]);
  };

  return (
    <div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {server.error && (
        <InlineNotice tone="error" className="mb-3">
          {server.error}
        </InlineNotice>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Score {localScore}</p>
        <p className="text-sm text-text-muted">
          {run.remaining - pending.length} left
        </p>
      </div>

      <div className="mt-2 flex items-center gap-3">
        {inHand ? (
          <>
            <Token kind={inHand} size="lg" />
            <span className="text-sm text-text-muted">
              next
              {preview.length === 0 && " — nothing"}
            </span>
            {preview.map((kind, index) => (
              <Token key={`${kind}-${index}`} kind={kind} size="sm" />
            ))}
          </>
        ) : (
          <p className="text-sm text-text-muted">Send these off to be sorted.</p>
        )}
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {Array.from({ length: SHELF_COUNT }, (_, shelfIndex) => {
          const shelf = board[shelfIndex] ?? [];
          const full = shelf.length >= SHELF_CAPACITY;
          return (
            <li key={shelfIndex}>
              <button
                type="button"
                onClick={() => place(shelfIndex)}
                disabled={full || mustSubmit || submitting}
                aria-label={`Shelf ${shelfIndex + 1}${
                  full ? ", full" : ""
                }: ${
                  shelf.length === 0
                    ? "empty"
                    : shelf.map((kind) => LABEL[kind]).join(", ")
                }`}
                className="flex min-h-11 w-full items-center gap-1 rounded-control border border-border bg-surface px-2 py-1.5 transition-colors enabled:hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
              >
                <span aria-hidden="true" className="flex flex-1 gap-1">
                  {Array.from({ length: SHELF_CAPACITY }, (_, slot) => {
                    const kind = shelf[slot];
                    return kind ? (
                      <Token key={slot} kind={kind} size="sm" />
                    ) : (
                      <span
                        key={slot}
                        className="h-8 flex-1 rounded-sm border border-dashed border-border"
                      />
                    );
                  })}
                </span>
                <span className="w-6 shrink-0 text-right text-xs text-text-muted">
                  {shelfIndex + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <form
        action={(formData) => startTransition(() => submitAction(formData))}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="runId" value={run.runId} />
        <input type="hidden" name="fromDrawIndex" value={run.drawIndex} />
        <input type="hidden" name="moves" value={pending.join("")} />
        <Button
          type="submit"
          disabled={pending.length === 0 || submitting}
          aria-busy={submitting}
        >
          {submitting
            ? "Sorting…"
            : `Send ${pending.length || ""} off`.replace("  ", " ")}
        </Button>
        {pending.length > 0 && !submitting && (
          <Button
            type="button"
            variant="quiet"
            onClick={() => setPending([])}
          >
            Put them back
          </Button>
        )}
      </form>
      {mustSubmit && pending.length > 0 && (
        <p className="mt-2 text-sm text-text-muted">
          That&apos;s as many as the barrow holds. Send them off to see what
          comes up next.
        </p>
      )}

      <div className="mt-3">
        <DayLine state={server} />
      </div>
    </div>
  );
}

function DayLine({ state }: { state: SortingActionState }) {
  if (!state.day) return null;
  const paid = coinsFromJSON(state.day.coinsPaidToday);
  return (
    <p className="text-xs text-text-muted">
      Best today {state.day.bestScore} · earned{" "}
      <CurrencyAmount amount={paid} compact />
      {state.day.nextTierScore !== null
        ? ` · ${state.day.nextTierScore} pays more`
        : " · nothing more to earn today, but the bench is open"}
    </p>
  );
}

function Token({ kind, size }: { kind: SortKind; size: "sm" | "lg" }) {
  return (
    <span
      className={`flex items-center justify-center rounded-sm font-semibold ${
        TONE[kind]
      } ${size === "lg" ? "h-12 w-12 text-xl" : "h-8 flex-1 text-sm"}`}
    >
      <span aria-hidden="true">{GLYPH[kind]}</span>
      <span className="sr-only">{LABEL[kind]}</span>
    </span>
  );
}
