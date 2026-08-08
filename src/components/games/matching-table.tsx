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
import type { MatchingRunView } from "@/server/modules/games/matching/run";
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

/**
 * How long a missed pair stays readable before the stones turn back.
 *
 * Long enough to take in two faces and commit them, short enough that it
 * never feels like waiting for the game. Play is blocked for exactly this
 * window, which is the point — a board that accepts the next tap while
 * the last pair is still showing loses the pair.
 */
const MISS_HOLD_MS = 900;

/**
 * Names a turn, so a hold is shown once and only once.
 *
 * Deliberately not the response nonce: see `handledTurn` below.
 */
function turnKey(run: MatchingRunView | null): string {
  return run ? `${run.runId}:${run.flipsUsed}` : "";
}

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

  /**
   * The turn being shown before the stones go back.
   *
   * The server resolves a turn on the second flip — two stones never
   * persist face up — so the response for a miss already has both stones
   * face down. Turning the second one showed the player nothing at all:
   * you tapped, and the board looked unchanged. The pair is held here
   * long enough to be read, then released.
   *
   * A match needs no hold: those stones stay up for good on their own.
   */
  const [held, setHeld] = useState<{
    cards: [number, number];
    pairs: [number, number];
  } | null>(null);

  const run = state.run;

  /**
   * Which turn has already been held, keyed by the run and the flip count
   * rather than the response nonce.
   *
   * The nonce advances on every response INCLUDING failures, and a failed
   * flip refreshes the run from the server — same finished turn, new
   * nonce, so a nonce guard would replay a hold the player has already
   * watched. Run plus flip count names the turn itself, so a response
   * that did not advance the game cannot re-reveal anything. Seeded from
   * the initial run so resuming a table mid-turn does not open with a
   * flash of the last pair.
   */
  const handledTurn = useRef(turnKey(initial.run));

  useEffect(() => {
    const key = turnKey(run);
    if (key === handledTurn.current) return;
    handledTurn.current = key;
    const turn = run?.lastTurn;
    // A match, a fresh table, or an odd flip mid-turn: nothing to hold,
    // and anything still held belongs to a turn that is over. Clearing
    // here is what lets a new table be dealt during a hold without the
    // stones staying frozen face up.
    if (!turn || turn.matched) {
      setHeld(null);
      return;
    }
    setHeld({ cards: turn.cards, pairs: turn.pairs });
    const timer = setTimeout(() => setHeld(null), MISS_HOLD_MS);
    return () => clearTimeout(timer);
  }, [run]);

  const paid = new Set(state.day?.paidToday ?? []);
  const faceOf = new Map<number, number>();
  for (const { card, pair } of run?.matched ?? []) faceOf.set(card, pair);
  for (const { card, pair } of run?.faceUp ?? []) faceOf.set(card, pair);
  // The held pair sits on top: it is the only thing that knows what the
  // second stone was.
  if (held) {
    faceOf.set(held.cards[0], held.pairs[0]);
    faceOf.set(held.cards[1], held.pairs[1]);
  }
  const matchedCards = new Set((run?.matched ?? []).map((row) => row.card));
  const heldCards = new Set<number>(held?.cards ?? []);

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
   *
   * A resolved turn is announced from `lastTurn` for the same reason the
   * board holds it: `faceUp` is empty once the server has adjudicated, so
   * reading only that told a screen-reader user the turn count had moved
   * and nothing whatever about the two stones they had just turned.
   */
  const announcement = (() => {
    if (!run) return "";
    if (run.status === "COMPLETED") {
      return `All ${run.pairsTotal} pairs found, in ${run.flipsUsed} turns.`;
    }
    const progress = `${run.pairsFound} of ${run.pairsTotal} pairs found.`;
    /**
     * Read from `lastTurn` and NOT from `held`.
     *
     * `held` is a 900 ms visual state, so wording the announcement around
     * it made the live region change twice per turn — once when the
     * server answered, and again when the stones turned back — which is
     * one redundant interruption per miss for the person least able to
     * ignore it. `lastTurn` changes only when the server does.
     */
    const turn = run.lastTurn;
    if (turn) {
      const faces = turn.cards
        .map(
          (card, index) =>
            `Stone ${card + 1} shows ${FACES[turn.pairs[index] as number] ?? "?"}`,
        )
        .join(", ");
      return `${faces}. ${turn.matched ? "A pair." : "No match."} ${progress}`;
    }
    const showing = run.faceUp
      .map(({ card, pair }) => `Stone ${card + 1} shows ${FACES[pair] ?? "?"}`)
      .join(". ");
    return showing === ""
      ? `${progress} ${run.flipsRemaining} turns left.`
      : `${showing}. ${progress}`;
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
              const isHeld = heldCards.has(card);
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
                        pending ||
                        isMatched ||
                        held !== null ||
                        run.status !== "IN_PROGRESS"
                      }
                      // Three states, three labels. A held stone is not a
                      // stone waiting for its partner — it is a stone on
                      // its way back down — and calling both of them
                      // "showing" is a board that lies about whose turn
                      // it is.
                      aria-label={
                        showing
                          ? `Stone ${card + 1}, showing ${FACES[pair] ?? "?"}${
                              isMatched
                                ? ", matched"
                                : isHeld
                                  ? ", no match"
                                  : ""
                            }`
                          : `Stone ${card + 1}, face down`
                      }
                      className={[
                        "flex aspect-square w-full items-center justify-center rounded-control border text-2xl",
                        // A turned stone grows very slightly as it turns,
                        // so a reveal is something you SEE happen rather
                        // than a face that was suddenly always there.
                        // motion-reduce drops the movement and keeps the
                        // colour change, which carries the same fact.
                        "transition-all duration-200 motion-reduce:transition-colors",
                        isMatched
                          ? "border-success/40 bg-success/10 opacity-70"
                          : showing
                            ? "scale-105 border-accent bg-surface-raised motion-reduce:scale-100"
                            : "border-border-strong bg-surface-sunken hover:bg-surface-raised",
                      ].join(" ")}
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
