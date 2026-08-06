"use client";

import { useActionState, useCallback, useEffect, useMemo, useState, startTransition } from "react";
import type { BoardView } from "@/server/modules/daily/word/game";
import {
  submitWordGuessAction,
  type WordGuessActionState,
} from "@/server/actions/daily";
import { formatCoins, coinsFromJSON } from "@/lib/money";
import { SectionHeading } from "@/components/ui/section-heading";

/**
 * Daily word challenge board: three difficulty cards, five-row tile board,
 * physical + on-screen keyboards. Evaluations arrive only from the server;
 * this component never sees the answer before completion. Tile states pair
 * color with icons and accessible labels (never color alone), and results
 * are announced through a polite live region.
 */

type Difficulty = "EASY" | "MEDIUM" | "HARD";

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

export type CellState = "E" | "P" | "A";

const CELL_STYLE: Record<CellState, string> = {
  E: "border-transparent bg-tile-exact text-accent-contrast",
  P: "border-dashed border-tile-present bg-surface-raised text-text",
  A: "border-transparent bg-tile-absent text-text-muted line-through",
};

export const CELL_ICON: Record<CellState, string> = { E: "●", P: "◐", A: "" };

export const CELL_LABEL: Record<CellState, string> = {
  E: "correct position",
  P: "in the word, different position",
  A: "not in the word",
};

const KEY_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
];

function newKey(): string {
  return crypto.randomUUID();
}

export function announceEvaluation(guess: string, evaluation: string): string {
  return guess
    .split("")
    .map((letter, index) => `${letter} ${CELL_LABEL[(evaluation[index] ?? "A") as CellState]}`)
    .join(", ");
}

interface WordGameProps {
  boards: Record<Difficulty, BoardView>;
}

export function WordGame({ boards: initialBoards }: WordGameProps) {
  const [boards, setBoards] = useState(initialBoards);
  const [selected, setSelected] = useState<Difficulty | null>(null);
  const [typed, setTyped] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [state, dispatch, pending] = useActionState<WordGuessActionState, FormData>(
    submitWordGuessAction,
    { result: null, error: null, nonce: 0 },
  );
  const [seenNonce, setSeenNonce] = useState(0);

  const board = selected ? boards[selected] : null;
  const playable =
    board !== null &&
    (board.status === "AVAILABLE" || board.status === "IN_PROGRESS");

  // Fold fresh server responses into the board state and announce them.
  useEffect(() => {
    if (state.nonce === seenNonce) {
      return;
    }
    setSeenNonce(state.nonce);
    setIdempotencyKey(newKey());
    if (state.error) {
      setAnnouncement(state.error);
      return;
    }
    const result = state.result;
    if (!result) {
      return;
    }
    setTyped("");
    setBoards((current) => {
      const previous = current[result.difficulty];
      return {
        ...current,
        [result.difficulty]: {
          ...previous,
          status: result.status === "IN_PROGRESS" ? "IN_PROGRESS" : result.status,
          attemptsUsed: result.attemptsUsed,
          attemptsRemaining: result.attemptsRemaining,
          guesses: result.guesses,
          answer: result.answer,
          rewardEarned: result.rewardCoins,
        },
      };
    });
    const lastGuess = result.guesses[result.guesses.length - 1];
    if (result.status === "SOLVED") {
      setAnnouncement(
        `Solved! You earned ${formatCoins(coinsFromJSON(result.rewardCoins))} coins.`,
      );
    } else if (result.status === "FAILED") {
      setAnnouncement(
        `Out of guesses. The word was ${result.answer ?? ""}. A new puzzle arrives tomorrow.`,
      );
    } else if (lastGuess) {
      setAnnouncement(
        `Guess ${result.attemptsUsed} of ${boards[result.difficulty].maxGuesses}: ${announceEvaluation(
          lastGuess.guess,
          lastGuess.evaluation,
        )}. ${result.attemptsRemaining} ${result.attemptsRemaining === 1 ? "guess" : "guesses"} remaining.`,
      );
    }
    // `boards` is intentionally read via the setter above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, seenNonce]);

  const submitTyped = useCallback(() => {
    if (!selected || !board || !playable || pending) {
      return;
    }
    if (typed.length !== board.length) {
      setAnnouncement(`Use exactly ${board.length} letters.`);
      return;
    }
    const formData = new FormData();
    formData.set("difficulty", selected);
    formData.set("guess", typed);
    formData.set("idempotencyKey", idempotencyKey);
    startTransition(() => dispatch(formData));
  }, [selected, board, playable, pending, typed, idempotencyKey, dispatch]);

  const pressKey = useCallback(
    (key: string) => {
      if (!board || !playable || pending) {
        return;
      }
      if (key === "ENTER") {
        submitTyped();
      } else if (key === "BACK") {
        setTyped((value) => value.slice(0, -1));
      } else if (/^[A-Z]$/.test(key)) {
        setTyped((value) =>
          value.length < board.length ? value + key : value,
        );
      }
    },
    [board, playable, pending, submitTyped],
  );

  // Physical keyboard support while a difficulty is open.
  useEffect(() => {
    if (!selected) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable=\"true\"]")
      ) {
        return;
      }
      if (event.key === "Enter") {
        // Never steal Enter from a focused control (links, buttons,
        // the on-screen keys) — their native activation wins.
        if (target?.closest("button, a, summary")) {
          return;
        }
        event.preventDefault();
        pressKey("ENTER");
      } else if (event.key === "Backspace") {
        event.preventDefault();
        pressKey("BACK");
      } else if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault();
        pressKey(event.key.toUpperCase());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, pressKey]);

  // Aggregate best-known state per letter for keyboard hints.
  const keyStates = useMemo(() => {
    const rank: Record<CellState, number> = { A: 1, P: 2, E: 3 };
    const states = new Map<string, CellState>();
    for (const guess of board?.guesses ?? []) {
      guess.guess.split("").forEach((letter, index) => {
        const cell = (guess.evaluation[index] ?? "A") as CellState;
        const known = states.get(letter);
        if (!known || rank[cell] > rank[known]) {
          states.set(letter, cell);
        }
      });
    }
    return states;
  }, [board]);

  return (
    <section aria-labelledby="word-game-heading">
      <SectionHeading id="word-game-heading">
        Today&apos;s word puzzles
      </SectionHeading>
      <p className="mt-1 max-w-prose text-sm text-text-muted">
        Three puzzles a day — one word each. Five guesses per puzzle, fresh
        words at midnight UTC. Solve for coins; missing costs nothing.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((difficulty) => {
          const summary = boards[difficulty];
          const isOpen = selected === difficulty;
          const statusLabel =
            summary.status === "SOLVED"
              ? "Solved"
              : summary.status === "FAILED"
                ? "Done for today"
                : summary.status === "IN_PROGRESS"
                  ? `${summary.attemptsRemaining} left`
                  : "Ready";
          return (
            <button
              key={difficulty}
              type="button"
              onClick={() => {
                setSelected(isOpen ? null : difficulty);
                setTyped("");
                setAnnouncement("");
              }}
              aria-expanded={isOpen}
              aria-controls={isOpen ? "word-board" : undefined}
              className={`rounded-surface border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                isOpen
                  ? "border-accent bg-surface-raised"
                  : "border-border bg-surface hover:border-border-strong"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{DIFFICULTY_LABELS[difficulty]}</span>
                <span className="text-xs text-text-muted">{statusLabel}</span>
              </span>
              <span className="mt-1 block text-xs text-text-muted">
                {summary.length} letters · 5 guesses ·{" "}
                {formatCoins(coinsFromJSON(summary.rewardCoins))} coins
              </span>
            </button>
          );
        })}
      </div>

      {/* One announcement element: visible and the live region, so
          assistive tech never hears the same message twice. */}
      <p
        role="status"
        aria-live="polite"
        className={
          announcement
            ? "mt-3 rounded-control border border-border bg-surface-raised px-3 py-2 text-sm text-text"
            : "sr-only"
        }
      >
        {announcement}
      </p>

      {board && selected && (
        <div id="word-board" className="mt-4">
          <div
            role="group"
            aria-label={`${DIFFICULTY_LABELS[selected]} puzzle board, ${board.length} letters, ${board.attemptsRemaining} of ${board.maxGuesses} guesses remaining`}
            className="mx-auto flex w-fit flex-col gap-1.5"
          >
            {Array.from({ length: board.maxGuesses }, (_, rowIndex) => {
              const submitted = board.guesses[rowIndex];
              const isTypingRow = playable && rowIndex === board.guesses.length;
              const letters = submitted
                ? submitted.guess.split("")
                : isTypingRow
                  ? typed.padEnd(board.length).split("")
                  : Array.from({ length: board.length }, () => " ");
              return (
                <div
                  key={`${rowIndex}-${submitted ? "submitted" : "open"}`}
                  className="flex gap-1.5"
                >
                  {letters.map((letter, columnIndex) => {
                    const cell = submitted
                      ? ((submitted.evaluation[columnIndex] ?? "A") as CellState)
                      : null;
                    return (
                      <div
                        key={columnIndex}
                        aria-label={
                          submitted && cell
                            ? `${letter} — ${CELL_LABEL[cell]}`
                            : letter.trim()
                              ? `${letter}, not submitted`
                              : "empty"
                        }
                        className={`relative flex size-10 items-center justify-center rounded-control border text-lg font-bold uppercase sm:size-11 ${
                          submitted ? "animate-tile-pop" : ""
                        } ${
                          cell
                            ? CELL_STYLE[cell]
                            : letter.trim()
                              ? "border-border-strong bg-surface text-text"
                              : "border-border bg-surface"
                        }`}
                      >
                        {letter.trim()}
                        {cell && CELL_ICON[cell] && (
                          <span
                            aria-hidden="true"
                            className="absolute right-0.5 top-0 text-[9px] leading-3"
                          >
                            {CELL_ICON[cell]}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {board.status === "SOLVED" && (
            <p className="mt-3 text-center text-sm font-medium text-text">
              Solved! The word was {board.answer}. You earned{" "}
              {formatCoins(coinsFromJSON(board.rewardEarned))} coins.
            </p>
          )}
          {board.status === "FAILED" && (
            <p className="mt-3 text-center text-sm text-text-muted">
              The word was {board.answer}. A new puzzle arrives tomorrow.
            </p>
          )}

          {playable && (
            <div className="mt-4" aria-label="On-screen keyboard">
              {KEY_ROWS.map((row) => (
                <div
                  key={row[0]}
                  className="mx-auto mb-1.5 flex w-full max-w-md justify-center gap-1"
                >
                  {row.map((key) => {
                    const known = key.length === 1 ? keyStates.get(key) : undefined;
                    const wide = key === "ENTER" || key === "BACK";
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={pending}
                        onClick={() => pressKey(key)}
                        aria-label={
                          key === "BACK"
                            ? "Backspace"
                            : key === "ENTER"
                              ? "Submit guess"
                              : known
                                ? `${key} — ${CELL_LABEL[known]}`
                                : key
                        }
                        className={`flex h-11 min-w-0 items-center justify-center rounded-control border text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50 ${
                          wide ? "flex-[1.6] px-1 text-xs" : "flex-1 max-w-10"
                        } ${
                          known
                            ? CELL_STYLE[known]
                            : "border-border bg-surface-raised text-text"
                        }`}
                      >
                        {key === "BACK" ? "⌫" : key === "ENTER" ? "Submit" : key}
                        {known && CELL_ICON[known] && (
                          <span aria-hidden="true" className="ml-0.5 text-[8px]">
                            {CELL_ICON[known]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
              <p className="mt-1 text-center text-xs text-text-muted">
                Type or tap, then Submit. {board.attemptsRemaining}{" "}
                {board.attemptsRemaining === 1 ? "guess" : "guesses"} left.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
