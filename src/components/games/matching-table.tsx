"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  MATCHING_CONFIG,
  MATCHING_DIFFICULTIES,
  type MatchingDifficulty,
} from "@/lib/games/matching-rules";
import {
  flipMatchingCardAction,
  startMatchingRunAction,
  type MatchingActionState,
} from "@/server/actions/matching";
import { formatCoins } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { InlineNotice } from "@/components/ui/inline-notice";

/**
 * The Stonesetter's Table.
 *
 * Every face on screen came from the server. The client holds no layout,
 * no seed, and no memory of what it has seen — it renders `matched` and
 * `faceUp` exactly as given and sends back a card index. That is why
 * there is no optimistic flip here: showing a face before the server has
 * named it would mean the client knew it, and it must not.
 */

/**
 * Pair glyphs. Shape and letter together, never colour alone — a matching
 * game played on colour is unplayable for a good number of people.
 */
const FACES = [
  "🌰", "🍄", "🪶", "🐚", "🔔", "🍐",
  "🌿", "🪵", "🧭", "🕯️", "🥚", "🪺",
  "❄️", "🪸", "🫐",
] as const;

const DIFFICULTY_LABEL: Record<MatchingDifficulty, string> = {
  GENTLE: "Gentle",
  BRISK: "Brisk",
  DEEP: "Deep",
};

export function MatchingTable({ initial }: { initial: MatchingActionState }) {
  const [chosen, setChosen] = useState<MatchingDifficulty>(
    initial.run?.difficulty ?? "GENTLE",
  );
  const [state, dispatch, pending] = useActionState(
    async (previous: MatchingActionState, formData: FormData) =>
      formData.get("intent") === "start"
        ? startMatchingRunAction(previous, formData)
        : flipMatchingCardAction(previous, formData),
    initial,
  );

  /**
   * The stone the player just turned, so focus can go back to it.
   *
   * Every stone is its own form, and the whole board is disabled during
   * the round trip — disabling the focused element drops focus to the
   * document body. A Gentle board is 40 turns and every one of them cost
   * a full re-tab through the skip link, five nav items, the wordmark,
   * the wallet chip and the back link. The keyboard path existed and was
   * unusable.
   */
  const flipped = useRef<number | null>(null);

  const run = state.run;
  const paid = new Set(state.day?.paidToday ?? []);
  const faceOf = new Map<number, number>();
  for (const { card, pair } of run?.matched ?? []) faceOf.set(card, pair);
  for (const { card, pair } of run?.faceUp ?? []) faceOf.set(card, pair);
  const matchedCards = new Set((run?.matched ?? []).map((row) => row.card));

  // Put focus back once the board is interactive again.
  useEffect(() => {
    if (pending) return;
    const card = flipped.current;
    if (card === null) return;
    flipped.current = null;
    // A matched stone stays disabled, so focus goes to its partner-less
    // neighbour rather than nowhere.
    const target =
      document.querySelector<HTMLButtonElement>(
        `[data-stone="${card}"]:not(:disabled)`,
      ) ??
      document.querySelector<HTMLButtonElement>("[data-stone]:not(:disabled)");
    target?.focus();
  }, [pending, state.nonce]);

  /**
   * What just happened, for anybody not looking at the board.
   *
   * There was no live region here at all: a screen-reader user turned a
   * stone and was told nothing about what was under it or whether it
   * matched.
   */
  const announcement = (() => {
    if (!run) return "";
    if (run.status === "COMPLETED") {
      return `All ${run.pairsTotal} pairs found, in ${run.flipsUsed} turns.`;
    }
    const showing = run.faceUp
      .map(({ card, pair }) => `Stone ${card + 1} shows ${FACES[pair] ?? "?"}`)
      .join(". ");
    return showing === ""
      ? `${run.pairsFound} of ${run.pairsTotal} pairs found. ${run.flipsRemaining} turns left.`
      : `${showing}. ${run.pairsFound} of ${run.pairsTotal} pairs found.`;
  })();

  return (
    <div>
      <fieldset className="mb-4">
        <legend className="text-sm font-medium text-text">
          How many stones?
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {MATCHING_DIFFICULTIES.map((difficulty) => {
            const config = MATCHING_CONFIG[difficulty];
            const done = paid.has(difficulty);
            return (
              <form action={dispatch} key={difficulty}>
                <input type="hidden" name="intent" value="start" />
                <input type="hidden" name="difficulty" value={difficulty} />
                <Button
                  type="submit"
                  variant={chosen === difficulty ? "primary" : "secondary"}
                  disabled={pending}
                  onClick={() => setChosen(difficulty)}
                >
                  {DIFFICULTY_LABEL[difficulty]}
                  <span className="ml-1 text-xs opacity-80">
                    {config.pairs} pairs
                  </span>
                  {/* Says plainly that today's coins are already taken, so
                      nobody plays a round expecting pay that is not coming. */}
                  {done && (
                    <span className="ml-1 text-xs opacity-80">· paid today</span>
                  )}
                </Button>
              </form>
            );
          })}
        </div>
      </fieldset>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {state.error && (
        <InlineNotice tone="warning" className="mb-3">
          {state.error}
        </InlineNotice>
      )}

      {run && run.status === "COMPLETED" && (
        <InlineNotice tone="success" className="mb-3">
          All {run.pairsTotal} pairs, in {run.flipsUsed} turns.{" "}
          {state.alreadyPaidToday ? (
            <>Today&apos;s coins for this table were already paid — this one
            was for the pleasure of it.</>
          ) : (
            <>
              That&apos;s <CurrencyAmount amount={BigInt(state.coinsAwarded)} />.
            </>
          )}
        </InlineNotice>
      )}

      {run ? (
        <>
          <p className="mb-2 text-sm text-text-muted">
            {run.pairsFound} of {run.pairsTotal} pairs ·{" "}
            <span className="tabular-nums">{run.flipsRemaining}</span> turns
            left · finishing in {run.par} or fewer pays a bonus
          </p>
          <ul
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${run.columns}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: run.cards }, (_, card) => {
              const pair = faceOf.get(card);
              const isMatched = matchedCards.has(card);
              const showing = pair !== undefined;
              return (
                <li key={card}>
                  <form action={dispatch}>
                    <input type="hidden" name="runId" value={run.runId} />
                    <input type="hidden" name="card" value={card} />
                    <button
                      type="submit"
                      data-stone={card}
                      onClick={() => {
                        flipped.current = card;
                      }}
                      // A matched stone is out of play; a finished table
                      // takes no more turns.
                      disabled={
                        pending || isMatched || run.status !== "IN_PROGRESS"
                      }
                      aria-label={
                        showing
                          ? `Stone ${card + 1}, showing ${FACES[pair] ?? "?"}${isMatched ? ", matched" : ""}`
                          : `Stone ${card + 1}, face down`
                      }
                      className={`flex aspect-square w-full items-center justify-center rounded-control border text-2xl transition-colors ${
                        isMatched
                          ? "border-success/40 bg-success/10 opacity-70"
                          : showing
                            ? "border-accent bg-surface-raised"
                            : "border-border-strong bg-surface-sunken hover:bg-surface-raised"
                      }`}
                    >
                      <span aria-hidden="true">
                        {showing ? (FACES[pair] ?? "?") : ""}
                      </span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-sm text-text-muted">
          Pick a size and the stonesetter will lay them out face down. Play as
          often as you like — each size pays once a day, so a second go is for
          the pleasure of it.
        </p>
      )}

      {state.day && BigInt(state.day.coinsToday) > 0n && (
        <p className="mt-3 text-sm text-text-muted">
          Earned at this table today: {formatCoins(BigInt(state.day.coinsToday))}{" "}
          coins.
        </p>
      )}
    </div>
  );
}
