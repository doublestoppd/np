"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import {
  spinFortuneAction,
  type FortuneSpinState,
} from "@/server/actions/fortune";
import type { FortuneView } from "@/server/modules/fortune/queries";
import {
  MOONS_WITHOUT_THE_POOL,
  ONE_MOON,
  SYMBOLS,
  THREE_OF_A_KIND,
  TWO_MOONS,
  type Symbol,
} from "@/lib/games/fortune/reels";
import { coinsFromJSON } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Modal } from "@/components/ui/modal";

/**
 * The Fortune Engine (ADR-66).
 *
 * Three drums, a stake ladder and a pool. The reels the player watches are
 * the reels the server stopped on — the animation spins through faces and
 * then lands on what actually came up, so nothing on screen is a
 * dramatisation of a number decided elsewhere.
 *
 * **The odds are on the page.** The paytable is rendered from the same
 * constants the server pays from, so it cannot drift out of step with the
 * machine, and the return is stated in plain words rather than buried. A
 * machine that takes about three coins in ten should say so where the
 * player can see it before they pull it, not in a document.
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
  symbols: [],
  line: "",
  stake: "0",
  payout: "0",
  jackpot: false,
  balance: "0",
  jackpotStandsAt: "0",
  error: null,
  nonce: 0,
};

/** How long the drums tumble before the real faces are shown. */
const SPIN_MS = 1_400;
const STAGGER_MS = 300;

export function FortuneMachine({ view }: { view: FortuneView }) {
  const [result, dispatch, spinning] = useActionState(spinFortuneAction, {
    ...INITIAL,
    balance: view.balance,
    jackpotStandsAt: view.jackpot.standsAt,
  });

  const [stake, setStake] = useState(() => view.stakes[0] ?? "25");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [tumbling, setTumbling] = useState(false);
  const [shown, setShown] = useState<Symbol[]>(["acorn", "bell", "star"]);
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
   * The drums land one at a time once the server has answered.
   *
   * Keyed on the action's nonce, not on the symbols: two identical spins
   * in a row produce the same symbols, and an effect watching those would
   * not fire the second time — the drums would sit still on a real pull.
   * This is the same handled-nonce shape the arcade needed.
   */
  useEffect(() => {
    if (result.nonce === settled || result.symbols.length === 0) return;
    setSettled(result.nonce);
    setTumbling(true);
    const timers = result.symbols.map((symbol, reel) =>
      setTimeout(
        () => {
          setShown((current) => {
            const next = [...current];
            next[reel] = symbol as Symbol;
            return next;
          });
          if (reel === result.symbols.length - 1) setTumbling(false);
        },
        SPIN_MS + reel * STAGGER_MS,
      ),
    );
    return () => timers.forEach(clearTimeout);
    // `settled` is the guard; depending on it would defeat it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.nonce, result.symbols]);

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
          Three moons at {view.topStake} takes the lot.
          {view.jackpot.lastWonBy
            ? ` Last taken by ${view.jackpot.lastWonBy}.`
            : " Nobody has taken it yet."}
        </p>
      </div>

      {/* The drums. */}
      <div
        className="mt-4 flex items-center justify-center gap-2 rounded-surface border border-border bg-surface-sunken p-4"
        aria-hidden="true"
      >
        {shown.map((symbol, reel) => (
          <span
            key={reel}
            className={`flex h-20 w-20 items-center justify-center rounded-control border border-border bg-surface text-4xl ${
              busy ? "animate-pulse" : ""
            }`}
          >
            {FACES[symbol]}
          </span>
        ))}
      </div>

      {/* Everything the drums say, for anybody not looking at them. */}
      <p role="status" aria-live="polite" className="sr-only">
        {busy
          ? "The drums are turning."
          : landed
            ? `${result.symbols.join(", ")}. ${
                payout > 0n
                  ? `${result.line}, ${result.payout} coins.`
                  : "Nothing this time."
              }`
            : "The engine is waiting."}
      </p>

      {landed && (
        <InlineNotice
          tone={result.jackpot ? "success" : payout > 0n ? "success" : "info"}
          className="mt-3"
        >
          {result.jackpot ? (
            <>
              <strong>Three moons.</strong> The whole pool —{" "}
              <CurrencyAmount amount={payout} />.
            </>
          ) : payout > 0n ? (
            <>
              <strong>{result.line}.</strong> <CurrencyAmount amount={payout} />{" "}
              back.
            </>
          ) : (
            <>Nothing on that one.</>
          )}
        </InlineNotice>
      )}

      {/* The stake ladder. */}
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-text">Stake</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {view.stakes.map((amount) => {
            const chosen = amount === stake;
            const affordable = balance >= coinsFromJSON(amount);
            return (
              <button
                key={amount}
                type="button"
                onClick={() => setStake(amount)}
                disabled={busy}
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
            ? "The top stake feeds the pool and is the only one that can take it."
            : `Only the top stake (${view.topStake}) feeds the pool and can win it. At this stake three moons pays ${MOONS_WITHOUT_THE_POOL}x instead.`}
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
            {/* Your own, never anybody else's (CLAUDE.md). */}
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
      />
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
 */
function Paytable({
  open,
  onClose,
  topStake,
}: {
  open: boolean;
  onClose: () => void;
  topStake: string;
}) {
  const lines = SYMBOLS.filter((symbol) => symbol !== "moon").map((symbol) => ({
    faces: `${FACES[symbol]}${FACES[symbol]}${FACES[symbol]}`,
    pays: `${THREE_OF_A_KIND[symbol]}x`,
  }));

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
          Every line is a multiple of what you staked.
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
                …at {topStake}. At any smaller stake, {MOONS_WITHOUT_THE_POOL}x.
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
