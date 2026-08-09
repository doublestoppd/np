"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import {
  spinFortuneAction,
  type FortuneSpinState,
} from "@/server/actions/fortune";
import type { FortuneView } from "@/server/modules/fortune/queries";
import {
  JACKPOT_LINE,
  MOONS_WITHOUT_THE_POOL,
  ONE_MOON,
  PAYLINES,
  REELS,
  ROWS,
  SYMBOLS,
  THREE_OF_A_KIND,
  TWO_MOONS,
  type Symbol,
} from "@/lib/games/fortune/reels";
import {
  landingMs,
  lastLandingMs,
  LOOP_FACES,
  reelTiming,
} from "@/lib/games/fortune/timing";
import { coinsFromJSON } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Modal } from "@/components/ui/modal";

/**
 * The Fortune Engine (ADR-66, amended by ADR-68).
 *
 * Three drums showing three faces each, five paylines, a stake ladder and
 * a pool. **The reels the player watches are the reels the server
 * stopped on.** The strip that scrolls past is filler, but the three faces
 * at the end of it are the server's answer, already in the DOM before the
 * animation starts — the reel travels to a result rather than revealing
 * one. Nothing on screen is a dramatisation of a number decided elsewhere.
 *
 * **A pull cannot be interrupted.** Every control is disabled from the
 * moment the handle goes down until the last drum has settled and the
 * outcome is on the page. That is not only anti-double-submit hygiene:
 * a machine that lets you start the next pull while the last one is still
 * turning is telling you the turning does not matter.
 *
 * **The odds are on the page.** The paytable is rendered from the same
 * constants the server pays from, so it cannot drift out of step with the
 * machine, and the return is stated in plain words rather than buried.
 */

const FACES: Record<Symbol, string> = {
  acorn: "🌰",
  toadstool: "🍄",
  bell: "🔔",
  honey: "🍯",
  key: "🗝️",
  star: "⭐",
  moon: "🌙",
};

const INITIAL: FortuneSpinState = {
  window: [],
  wins: [],
  line: "",
  stake: "0",
  payout: "0",
  jackpot: false,
  balance: "0",
  jackpotStandsAt: "0",
  error: null,
  nonce: 0,
};

/** What the drums show before anybody has pulled them. */
const AT_REST: Symbol[][] = [
  ["bell", "acorn", "toadstool"],
  ["acorn", "star", "honey"],
  ["toadstool", "acorn", "key"],
];

/** One face, in both directions. Sized so three reels fit a 360px screen. */
const CELL = "4.5rem";

function fillerFaces(count: number): Symbol[] {
  return Array.from(
    { length: count },
    () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)] as Symbol,
  );
}

export function FortuneMachine({ view }: { view: FortuneView }) {
  const [result, dispatch, spinning] = useActionState(spinFortuneAction, {
    ...INITIAL,
    balance: view.balance,
    jackpotStandsAt: view.jackpot.standsAt,
  });

  const [stake, setStake] = useState(() => view.stakes[0] ?? "25");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [tumbling, setTumbling] = useState(false);
  const [shown, setShown] = useState<Symbol[][]>(AT_REST);
  const [filler, setFiller] = useState<Symbol[][]>([]);
  const [paytableOpen, setPaytableOpen] = useState(false);
  const [settled, setSettled] = useState(0);

  const balance = coinsFromJSON(
    result.nonce > 0 ? result.balance : view.balance,
  );
  const pool = coinsFromJSON(
    result.nonce > 0 ? result.jackpotStandsAt : view.jackpot.standsAt,
  );
  const topStake = stake === view.topStake;
  const canAfford = balance >= coinsFromJSON(stake);

  /**
   * The drums turn once the server has answered, and land left to right.
   *
   * Keyed on the action's nonce, not on the symbols: two identical pulls
   * in a row produce the same faces, and an effect watching those would
   * not fire the second time — the drums would sit still on a real pull.
   * This is the same handled-nonce shape the arcade needed.
   */
  useEffect(() => {
    if (result.nonce === settled || result.window.length === 0) return;
    setSettled(result.nonce);
    setShown(result.window as Symbol[][]);
    setFiller(Array.from({ length: REELS }, () => fillerFaces(LOOP_FACES)));
    setTumbling(true);

    // Under reduced motion the CSS collapses the animation to nothing, so
    // the gate has to collapse with it — otherwise the faces are already
    // final and the controls stay dead for ten seconds for no reason.
    const still =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const settle = still ? 0 : lastLandingMs(REELS);

    const timer = setTimeout(() => setTumbling(false), settle);
    return () => clearTimeout(timer);
    // `settled` is the guard; depending on it would defeat it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.nonce, result.window]);

  const pull = () => {
    const data = new FormData();
    data.set("stake", stake);
    data.set("idempotencyKey", key);
    setKey(crypto.randomUUID());
    startTransition(() => dispatch(data));
  };

  const busy = spinning || tumbling;
  const landed = result.nonce === settled && !tumbling && result.nonce > 0;
  const payout = coinsFromJSON(result.payout);

  /** Which cells are on a winning line, once everything has stopped. */
  const lit = new Set<string>();
  if (landed) {
    for (const win of result.wins) {
      const payline = PAYLINES.find((line) => line.number === win.line);
      payline?.rows.forEach((row, reel) => lit.add(`${reel}-${row}`));
    }
  }
  const litLines = new Set(landed ? result.wins.map((win) => win.line) : []);

  return (
    <div>
      {result.error && (
        <InlineNotice tone="warning" className="mb-3">
          {result.error}
        </InlineNotice>
      )}

      {/* The pool, above everything, because it is the reason to be here. */}
      <div className="rounded-surface border border-accent/30 bg-accent-soft p-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          The pool stands at
        </p>
        <p className="mt-1 font-display text-3xl font-bold tabular-nums text-accent-strong">
          <CurrencyAmount amount={pool} />
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Three moons on line {JACKPOT_LINE} at {view.topStake} takes the lot.
          {view.jackpot.lastWonBy
            ? ` Last taken by ${view.jackpot.lastWonBy}.`
            : " Nobody has taken it yet."}
        </p>
      </div>

      {/* The machine. Announced by the live region below, not by the grid. */}
      <div
        className="mt-4 flex items-stretch justify-center gap-1.5 rounded-surface border border-border bg-surface-sunken p-3"
        style={{ ["--reel-cell" as string]: CELL }}
        data-testid="fortune-window"
        aria-hidden="true"
      >
        <LineNumbers side="start" lit={litLines} />
        <div className="flex gap-1.5">
          {[...Array(REELS).keys()].map((reel) => (
            <Reel
              key={reel}
              // Keyed on the pull so the animation restarts every time.
              // Without this the reels move once and never again.
              spinKey={`${settled}-${reel}`}
              faces={(shown[reel] as Symbol[]) ?? AT_REST[0] ?? []}
              loop={tumbling ? ((filler[reel] as Symbol[]) ?? []) : []}
              spinning={tumbling}
              landAtMs={landingMs(reel)}
              lit={lit}
              reel={reel}
            />
          ))}
        </div>
        <LineNumbers side="end" lit={litLines} />
      </div>

      {/* Everything the drums say, for anybody not looking at them. */}
      <p role="status" aria-live="polite" className="sr-only">
        {busy
          ? "The drums are turning."
          : landed
            ? `${shown.map((reel) => reel.join(", ")).join("; ")}. ${
                payout > 0n
                  ? `${result.line}, ${result.payout} coins.`
                  : "Nothing this time."
              }`
            : "The engine is waiting."}
      </p>

      {landed && (
        // The wrapper carries the hook for the browser tests. It cannot go
        // on the notice: InlineNotice takes no such prop, and a hyphenated
        // JSX attribute on a component is not excess-checked, so it was
        // accepted, dropped, and quietly untestable.
        <div data-testid="fortune-outcome">
          <InlineNotice
            tone={payout > 0n ? "success" : "info"}
            className="mt-3"
          >
            {result.jackpot ? (
              <>
                <strong>Three moons on the centre line.</strong> The whole pool
                — <CurrencyAmount amount={payout} />.
              </>
            ) : payout > 0n ? (
              <>
                <strong>{result.line}.</strong>{" "}
                <CurrencyAmount amount={payout} /> back.
              </>
            ) : (
              <>Nothing on that one.</>
            )}
          </InlineNotice>
        </div>
      )}

      {/* The stake ladder. */}
      <fieldset className="mt-4" disabled={busy}>
        <legend className="text-sm font-medium text-text">
          Stake · all five lines
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {view.stakes.map((amount) => {
            const chosen = amount === stake;
            const affordable = balance >= coinsFromJSON(amount);
            return (
              <button
                key={amount}
                type="button"
                onClick={() => setStake(amount)}
                aria-pressed={chosen}
                className={`min-h-11 rounded-control border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60 ${
                  chosen
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-border-strong bg-surface text-text hover:bg-accent-soft"
                } ${affordable ? "" : "opacity-60"}`}
              >
                {amount}
                {amount === view.topStake && (
                  // The space is inside the span on purpose: the
                  // accessible name is a concatenation of text nodes, and
                  // a margin is not one — without it a screen reader says
                  // "500· pool".
                  <span className="text-xs font-normal">{" · pool"}</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 max-w-prose text-xs text-text-muted">
          {topStake
            ? `The top stake feeds the pool, and line ${JACKPOT_LINE} is the only line that can take it.`
            : `Only the top stake (${view.topStake}) feeds the pool and can win it. At this stake three moons pays ${MOONS_WITHOUT_THE_POOL}x the line instead.`}
        </p>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={pull} disabled={busy || !canAfford}>
          {busy ? "Turning…" : `Pull · ${stake}`}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPaytableOpen(true)}
          disabled={busy}
        >
          What it pays
        </Button>
      </div>

      {!canAfford && (
        <p className="mt-2 text-sm text-text-muted">
          Not enough coins for that stake. You have{" "}
          <CurrencyAmount amount={balance} />.
        </p>
      )}

      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <div className="flex gap-1">
          <dt className="text-text-muted">Your coins</dt>
          <dd className="font-medium text-text">
            <CurrencyAmount amount={balance} />
          </dd>
        </div>
        {coinsFromJSON(view.bestWin) > 0n && (
          <div className="flex gap-1">
            <dt className="text-text-muted">Your best here</dt>
            <dd className="font-medium text-text">
              <CurrencyAmount amount={coinsFromJSON(view.bestWin)} />
            </dd>
          </div>
        )}
      </dl>

      <Paytable
        open={paytableOpen}
        onClose={() => setPaytableOpen(false)}
        topStake={view.topStake}
        stake={stake}
      />
    </div>
  );
}

/**
 * One drum: a tall strip inside a window three faces high.
 *
 * The strip is the loop of filler TWICE, then the three faces the server
 * stopped on. Two copies is what makes the constant-speed phase seamless:
 * translating by exactly one copy's height lands on identical faces, so
 * the wrap has nothing to see. The settle then carries on through the
 * second copy and onto the result, which sits at the very end — so
 * wherever the animation is interrupted, what ends up in the window is the
 * server's answer and nothing else.
 *
 * At rest there is no loop, the strip is only the three faces, and both
 * travels are zero — the same markup draws a still machine.
 */
function Reel({
  spinKey,
  faces,
  loop,
  spinning,
  landAtMs,
  lit,
  reel,
}: {
  spinKey: string;
  faces: Symbol[];
  loop: Symbol[];
  spinning: boolean;
  landAtMs: number;
  lit: Set<string>;
  reel: number;
}) {
  const strip = [...loop, ...loop, ...faces];
  const { spinMs, settleMs, loopMs, loops } = reelTiming(reel);
  // Where the result begins, whether or not there is a loop in front of it.
  const faceStart = strip.length - ROWS;
  return (
    <div
      className="overflow-hidden rounded-control border border-border bg-surface"
      style={{
        width: "var(--reel-cell)",
        height: `calc(var(--reel-cell) * ${ROWS})`,
      }}
    >
      <div
        key={spinKey}
        className={`reel-strip ${spinning ? "reel-strip-spinning" : ""}`}
        style={{
          ["--reel-loop-travel" as string]: `calc(var(--reel-cell) * -${loop.length})`,
          ["--reel-final-travel" as string]: `calc(var(--reel-cell) * -${faceStart})`,
          ["--reel-loop-ms" as string]: `${loopMs}ms`,
          ["--reel-loops" as string]: `${loops}`,
          ["--reel-spin-ms" as string]: `${spinMs}ms`,
          ["--reel-settle-ms" as string]: `${settleMs}ms`,
        }}
        data-lands-at={landAtMs}
      >
        {strip.map((symbol, index) => {
          // Only the last three cells are the result, so only they can be
          // on a winning line.
          const row = index - faceStart;
          const isLit = !spinning && lit.has(`${reel}-${row}`);
          return (
            <span
              key={index}
              className={`flex items-center justify-center text-4xl transition-colors ${
                isLit ? "rounded-control bg-accent-soft" : ""
              }`}
              style={{ height: "var(--reel-cell)" }}
            >
              {FACES[symbol]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The line numbers down each side, as they are printed on a real machine.
 *
 * Derived from the paylines rather than listed: a line's badge sits at the
 * row it enters on (left) and the row it leaves on (right), which is what
 * puts the diagonals on opposite corners without anybody arranging them.
 */
function LineNumbers({
  side,
  lit,
}: {
  side: "start" | "end";
  lit: Set<number>;
}) {
  return (
    <div className="flex flex-col justify-between py-0.5">
      {[...Array(ROWS).keys()].map((row) => (
        <div
          key={row}
          className="flex items-center gap-0.5"
          style={{ height: "var(--reel-cell)" }}
        >
          {PAYLINES.filter(
            (line) => (side === "start" ? line.rows[0] : line.rows[2]) === row,
          ).map((line) => (
            <span
              key={line.number}
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[0.625rem] font-bold tabular-nums transition-colors ${
                lit.has(line.number)
                  ? "border-accent bg-accent text-accent-contrast"
                  : "border-border-strong bg-surface text-text-muted"
              }`}
            >
              {line.number}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The paytable, rendered from the same constants the server pays from.
 *
 * Including the honest headline: this machine keeps roughly three coins in
 * ten. Stating it is not a legal nicety here — the design philosophy asks
 * that the game never mislead a player about what a thing costs them, and
 * a machine of chance that hides its edge is doing exactly that.
 *
 * Every multiple is of the LINE stake, so the table also has to say what a
 * line is staked. "150x" against a 500 pull reads as 75,000 coins, and it
 * is 15,000.
 */
function Paytable({
  open,
  onClose,
  topStake,
  stake,
}: {
  open: boolean;
  onClose: () => void;
  topStake: string;
  stake: string;
}) {
  const lines = SYMBOLS.filter((symbol) => symbol !== "moon").map((symbol) => ({
    faces: `${FACES[symbol]}${FACES[symbol]}${FACES[symbol]}`,
    pays: `${THREE_OF_A_KIND[symbol]}x`,
  }));
  const perLine = coinsFromJSON(stake) / BigInt(PAYLINES.length);

  return (
    <Modal open={open} onClose={onClose} labelledBy="paytable-heading">
      <div className="p-5">
        <h2
          id="paytable-heading"
          className="font-display text-lg font-semibold text-text"
        >
          What the engine pays
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Five lines, left to right: the three rows and the two diagonals. Your
          pull is split across all of them, so a stake of {stake} is{" "}
          <CurrencyAmount amount={perLine} /> on each line, and every multiple
          below is of that.
        </p>

        <table className="mt-4 w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <td className="py-1.5 text-xl">
                {FACES.moon}
                {FACES.moon}
                {FACES.moon}
              </td>
              <td className="py-1.5 text-right font-semibold text-accent-strong">
                The pool
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-1.5 text-xs text-text-muted" colSpan={2}>
                …on line {JACKPOT_LINE} at {topStake}. On any other line, or at
                any smaller stake, {MOONS_WITHOUT_THE_POOL}x.
              </td>
            </tr>
            {lines.reverse().map((line) => (
              <tr key={line.faces} className="border-b border-border">
                <td className="py-1.5 text-xl">{line.faces}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">
                  {line.pays}
                </td>
              </tr>
            ))}
            <tr className="border-b border-border">
              <td className="py-1.5 text-xl">
                {FACES.moon}
                {FACES.moon}
              </td>
              <td className="py-1.5 text-right font-medium tabular-nums">
                {TWO_MOONS}x
              </td>
            </tr>
            <tr>
              <td className="py-1.5 text-xl">{FACES.moon}</td>
              <td className="py-1.5 text-right font-medium tabular-nums">
                {ONE_MOON}x
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-4 max-w-prose text-sm text-text-muted">
          The engine keeps about three coins in every ten over a long evening,
          and the pool is what the rest of the top stake goes into. It is a
          machine of chance and it is not on your side — play it for the turn of
          the drums, not for the income.
        </p>

        <div className="mt-5 flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
