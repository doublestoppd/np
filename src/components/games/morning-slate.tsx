"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { formatCoins } from "@/lib/money";
import { conflictingCells, isComplete, rowOf } from "@/lib/games/sudoku-grid";
import type { SudokuActionState } from "@/server/actions/sudoku";
import { sudokuAction } from "@/server/actions/sudoku";
import type { SudokuView } from "@/server/modules/games/sudoku/attempt";
import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { InlineNotice } from "@/components/ui/inline-notice";

/**
 * The Morning Slate (ADR-51).
 *
 * Everyone in the valley works the same grid, and it changes at midnight
 * UTC like every other daily thing here.
 *
 * **Conflicts are marked locally.** A repeat in a row, column or box is
 * arithmetic that needs no solution, so the grid can flag a mistake the
 * instant it is typed without the server ever revealing an answer. The
 * server's only judgement is on a finished grid: right, or not right yet.
 * It never says which cell, because "which cell" is the solution handed
 * over one call at a time.
 *
 * Working is saved server-side as it is typed, so a closed tab loses
 * nothing. The optimistic grid is what the player sees — waiting for a
 * round trip before a digit appears would make the whole thing feel
 * broken on a phone.
 *
 * Mobile-first at 360px: the grid is nine columns of equal fraction, and
 * the number pad is a row of large targets under it rather than a
 * keyboard, because typing into 81 tiny inputs on a phone is miserable.
 */

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * How many wrong full-grid checks pass before the count is mentioned at
 * all. Not a limit — nothing is taken and the grid never locks. Being told
 * "you've checked it once" the moment you first check it is a scold for
 * doing the thing the button is for; by the fourth, the number is a fact
 * about your morning rather than a comment on you.
 */
const WRONG_CHECK_NOTE_AFTER = 3;

export function MorningSlate({ initial }: { initial: SudokuView }) {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState<SudokuActionState, FormData>(
    sudokuAction,
    {
      view: initial,
      error: null,
      justSolved: false,
      wrong: false,
      coinsAwarded: "0",
      nonce: 0,
    },
  );

  const view = state.view ?? initial;
  /** The grid under the player's fingers. Authoritative for what is shown. */
  const [grid, setGrid] = useState(view.grid);
  const [selected, setSelected] = useState<number | null>(null);
  /** Cleared as soon as the player edits, so it never lingers over new work. */
  const [checked, setChecked] = useState(false);

  const solved = view.solved;

  /**
   * Pull the shell up to date once the grid is finished.
   *
   * The wallet chip and the home page's activity list are server-rendered,
   * so a 420-coin payout left them showing the old balance until the next
   * navigation. Deliberately AFTER the solve rather than in the action:
   * revalidating mid-puzzle would re-render the tree under the player's
   * cursor. The ref stops the refresh repeating on every later render.
   */
  const refreshed = useRef(false);
  useEffect(() => {
    if (state.justSolved && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [state.justSolved, router]);
  const conflicts = useMemo(() => new Set(conflictingCells(grid)), [grid]);
  const complete = isComplete(grid);

  const submit = (next: string, intent: "save" | "check") => {
    const formData = new FormData();
    formData.set("entries", next);
    formData.set("intent", intent);
    startTransition(() => dispatch(formData));
  };

  const write = (digit: string | null) => {
    if (solved || selected === null) return;
    if (view.givens[selected] !== ".") return;
    const next =
      grid.slice(0, selected) + (digit ?? ".") + grid.slice(selected + 1);
    setGrid(next);
    setChecked(false);
    submit(next, "save");
  };

  // Arrow keys move the selection; digits write; backspace clears. The
  // grid is a real roving-tabindex widget rather than 81 tab stops.
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -9,
      ArrowDown: 9,
    };
    const delta = moves[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      const next = index + delta;
      if (next >= 0 && next < 81) {
        // Horizontal moves must not wrap onto the next line.
        if (Math.abs(delta) === 1 && rowOf(next) !== rowOf(index)) return;
        setSelected(next);
        document.getElementById(`slate-cell-${next}`)?.focus();
      }
      return;
    }
    // Arrows still move on a solved grid — reading it back is the point.
    // Writing does not.
    if (DIGITS.includes(event.key as (typeof DIGITS)[number])) {
      event.preventDefault();
      setSelected(index);
      if (!solved && view.givens[index] === ".") {
        const next = grid.slice(0, index) + event.key + grid.slice(index + 1);
        setGrid(next);
        setChecked(false);
        submit(next, "save");
      }
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      setSelected(index);
      if (!solved && view.givens[index] === ".") {
        const next = grid.slice(0, index) + "." + grid.slice(index + 1);
        setGrid(next);
        setChecked(false);
        submit(next, "save");
      }
    }
  };

  const selectedDigit = selected === null ? null : grid[selected];

  return (
    <div>
      {solved ? (
        <InlineNotice tone="success" className="mb-3">
          <strong>Finished.</strong>{" "}
          {view.solveSeconds !== null && `${formatDuration(view.solveSeconds)}. `}
          {BigInt(view.coins) > 0n && (
            <>
              <CurrencyAmount amount={BigInt(view.coins)} /> for it.
            </>
          )}
        </InlineNotice>
      ) : checked && state.wrong ? (
        <InlineNotice tone="warning" className="mb-3">
          Full, but not right yet. Nothing is lost — the slate stays as it is.
        </InlineNotice>
      ) : null}

      {state.error && (
        <InlineNotice tone="warning" className="mb-3">
          {state.error}
        </InlineNotice>
      )}

      {/* ---- The grid --------------------------------------------------- */}
      {/* grid -> row -> gridcell. The rows were missing, so 81 cells sat
          as direct children of the grid and row-wise navigation in a
          screen reader had nothing to walk. `display: contents` keeps the
          nine-column layout exactly as it was while giving the structure
          ARIA requires. */}
      <div
        role="grid"
        aria-label="Today's slate"
        aria-readonly={solved}
        className="mx-auto grid w-full max-w-sm grid-cols-9 gap-px rounded-control border-2 border-border-strong bg-border-strong"
      >
        {Array.from({ length: 9 }, (_, row) =>
          Array.from({ length: 9 }, (_, column) => {
            const index = row * 9 + column;
            const given = view.givens[index] !== ".";
            const value = grid[index] ?? ".";
            const clash = conflicts.has(index);
            const isSelected = selected === index;
            const sameDigit =
              selectedDigit !== null &&
              selectedDigit !== "." &&
              value === selectedDigit;
            return (
              <button
                key={index}
                id={`slate-cell-${index}`}
                type="button"
                role="gridcell"
                // One tab stop for the whole grid; arrows move within it.
                tabIndex={
                  isSelected || (selected === null && index === 0) ? 0 : -1
                }
                aria-label={`Row ${row + 1}, column ${column + 1}${
                  value === "." ? ", empty" : `, ${value}`
                }${given ? ", given" : ""}${clash ? ", repeated" : ""}`}
                aria-selected={isSelected}
                // A solved grid is read-only, not unreachable. `disabled`
                // took all 81 cells out of the tab order, so a player who
                // finished could not read back what they had solved.
                aria-disabled={solved || undefined}
                onClick={() => setSelected(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={[
                  "aspect-square min-h-0 text-base font-semibold tabular-nums transition-colors sm:text-lg",
                  // The 3×3 boxes, drawn with heavier interior edges.
                  column % 3 === 2 && column !== 8 ? "mr-px" : "",
                  row % 3 === 2 && row !== 8 ? "mb-px" : "",
                  /**
                   * Two states, two channels — and they used to share one.
                   *
                   * Selection and conflict were both drawn as a background
                   * tint in the same ternary, so conflict won: selecting a
                   * repeated digit made the selection vanish, and a player
                   * correcting the mistake could not see which cell they
                   * were about to type into. Focus did not save it either,
                   * because a tap does not trigger :focus-visible.
                   *
                   * So the BACKGROUND says what kind of cell this is, the
                   * RING says which one is selected, and the DIGIT's colour
                   * says whether it is in conflict. A cell can now be all
                   * three at once and show all three.
                   */
                  clash
                    ? "text-danger"
                    : given
                      ? "text-text"
                      : "text-accent",
                  clash
                    ? "bg-danger-soft"
                    : sameDigit
                      ? "bg-accent/10"
                      : given
                        ? "bg-surface-sunken"
                        : "bg-surface",
                  // Inset so it never overlaps a neighbour, and strong
                  // enough to read over the conflict tint.
                  isSelected
                    ? "ring-2 ring-inset ring-accent-strong"
                    : "",
                ].join(" ")}
              >
                {value === "." ? "" : value}
              </button>
            );
          }),
        ).map((cells, row) => (
          <div key={row} role="row" className="contents">
            {cells}
          </div>
        ))}
      </div>

      {/* ---- The pad ---------------------------------------------------- */}
      {!solved && (
        <>
          <div className="mx-auto mt-3 grid w-full max-w-sm grid-cols-5 gap-1.5 sm:grid-cols-10">
            {DIGITS.map((digit) => (
              <Button
                key={digit}
                type="button"
                variant="secondary"
                onClick={() => write(digit)}
                disabled={selected === null || view.givens[selected] !== "."}
                className="min-h-11 px-0 tabular-nums"
              >
                {digit}
              </Button>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => write(null)}
              disabled={selected === null || view.givens[selected] !== "."}
              className="min-h-11 px-0"
            >
              <span aria-hidden="true">⌫</span>
              <span className="sr-only">Clear the cell</span>
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={!complete || pending}
              onClick={() => {
                setChecked(true);
                submit(grid, "check");
              }}
            >
              {pending ? "Checking…" : "Check it"}
            </Button>
            {/* The figure stays put once the grid is full. It used to be
                replaced by "Every square filled", which took the number
                away at the exact moment the player was about to claim
                it. */}
            <span className="text-sm text-text-muted">
              {complete && "Every square filled. "}
              Worth {formatCoins(BigInt(view.rewardJson))} coins.
            </span>
          </div>
        </>
      )}

      <p className="mt-3 text-xs text-text-muted">
        The same grid for everyone, chalked fresh at midnight GST. Repeats in
        a row, column, or box are marked as you go.
        {view.wrongChecks > WRONG_CHECK_NOTE_AFTER &&
          ` You've checked it ${view.wrongChecks} times so far.`}
        {view.personalBestSeconds !== null &&
          ` Your quickest is ${formatDuration(view.personalBestSeconds)}.`}
      </p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
