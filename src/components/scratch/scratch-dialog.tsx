"use client";

import { useActionState, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCoins } from "@/lib/money";
import {
  isNearMiss,
  isWinningReveal,
  parseReveal,
  symbolAt,
} from "@/lib/games/scratch-symbols";
import type { ScratchActionState } from "@/server/actions/scratch";
import { scratchCardAction } from "@/server/actions/scratch";
import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Scraping a chit (ADR-48).
 *
 * The three marks are decided and recorded by the server before this
 * renders anything — the scraping is theatre over a settled result, which
 * is what every scratch card in the world is. Nothing here can change what
 * was won; uncovering a panel is a local reveal of a fact the database
 * already holds.
 *
 * A player who opens the network tab can spoil their own surprise. That is
 * the honest trade for a reveal that cannot desynchronise from the payout,
 * and it costs them nothing but the fun.
 */

export interface ScratchPrizeRowView {
  label: string;
  kind: "COINS" | "ITEM" | "NOTHING" | "JACKPOT";
  coins: string;
  itemName: string | null;
  itemRarity: string | null;
  quantity: number;
}

const INITIAL: ScratchActionState = {
  outcome: null,
  error: null,
  replayed: false,
  nonce: 0,
};

export function ScratchDialog({
  itemId,
  itemName,
  owned,
  returnTo,
  priceJson,
  prizes,
  topPrize,
  jackpotJson,
}: {
  itemId: string;
  itemName: string;
  owned: number;
  returnTo: string;
  priceJson: string;
  prizes: ScratchPrizeRowView[];
  topPrize: ScratchPrizeRowView | null;
  jackpotJson: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState(scratchCardAction, INITIAL);
  /**
   * One key per attempt, minted on the client and replaced when a result
   * lands. Deriving it from the render count instead reset it whenever the
   * dialog remounted, so closing and reopening replayed the previous card
   * rather than scratching a new one.
   */
  const [attemptKey, setAttemptKey] = useState(() => crypto.randomUUID());
  /** Chits scraped since opening, so the count is right without a refetch. */
  const [spent, setSpent] = useState(0);
  /** Panels the player has actually uncovered, by index. */
  const [uncovered, setUncovered] = useState<number[]>([]);
  /** Guards against a stale reveal from the previous chit. */
  const [shownNonce, setShownNonce] = useState(0);
  const titleId = useId();

  const outcome = state.outcome;
  const fresh = outcome !== null && state.nonce !== shownNonce;
  if (fresh) {
    // A new result arrived: cover the panels again for the new card, mint
    // the next key, and count the chit that just went.
    setShownNonce(state.nonce);
    setUncovered([]);
    setAttemptKey(crypto.randomUUID());
    setSpent((count) => count + 1);
  }

  const remaining = Math.max(0, owned - spent);
  const marks = outcome ? parseReveal(outcome.reveal) : [];
  const allUp = marks.length > 0 && uncovered.length === marks.length;
  const won = isWinningReveal(marks);
  const nearMiss = isNearMiss(marks);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setUncovered([]);
          setSpent(0);
          setOpen(true);
        }}
      >
        Scratch
        <span className="sr-only"> {itemName}</span>
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          // Pull the satchel and the balance up to date now rather than
          // mid-scratch, which would close the card out from under them.
          router.refresh();
        }}
        labelledBy={titleId}
      >
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <h2 id={titleId} className="font-display text-lg font-bold text-text">
            {itemName}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {remaining === 1
              ? "One in your satchel"
              : `${remaining} in your satchel`}{" "}
            ·{" "}
            {formatCoins(BigInt(priceJson))} coins each
          </p>

          <div className="mt-3 rounded-control border border-accent/40 bg-accent/5 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-text-muted">
              The Pans
            </p>
            <p className="font-display text-2xl font-bold tabular-nums text-text">
              {formatCoins(BigInt(jackpotJson))}
            </p>
            <p className="text-xs text-text-muted">
              Three of ✹ takes the lot. Every chit scraped anywhere adds to it.
            </p>
          </div>

          {outcome === null ? (
            <>
              {topPrize && (
                <p className="mt-4 text-sm text-text">
                  Top mark on this chit:{" "}
                  <strong className="font-semibold">
                    {topPrize.kind === "COINS"
                      ? `${formatCoins(BigInt(topPrize.coins))} coins`
                      : (topPrize.itemName ?? topPrize.label)}
                  </strong>
                </p>
              )}
              {prizes.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-text-muted">
                    What&apos;s on this chit
                  </summary>
                  <ul className="mt-2 space-y-1 text-sm text-text-muted">
                    {prizes.map((prize) => (
                      <li key={prize.label}>
                        {prize.kind === "JACKPOT"
                          ? "The pans, in full"
                          : prize.kind === "COINS"
                            ? `${formatCoins(BigInt(prize.coins))} coins`
                            : `${prize.quantity > 1 ? `${prize.quantity} × ` : ""}${prize.itemName}`}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <>
              <ul className="mt-4 grid grid-cols-3 gap-2">
                {marks.map((mark, index) => {
                  const up = uncovered.includes(index);
                  const symbol = symbolAt(mark);
                  return (
                    <li key={index}>
                      <button
                        type="button"
                        disabled={up}
                        onClick={() =>
                          setUncovered((current) => [...current, index])
                        }
                        aria-label={
                          up
                            ? `Panel ${index + 1}: ${symbol.name}`
                            : `Panel ${index + 1}, still covered — scrape it`
                        }
                        className={`flex aspect-square w-full items-center justify-center rounded-control border text-3xl transition-colors ${
                          up
                            ? "border-accent bg-surface-raised text-text"
                            : "border-border-strong bg-[repeating-linear-gradient(45deg,var(--color-surface-sunken)_0_6px,var(--color-surface)_6px_12px)] hover:brightness-105"
                        }`}
                      >
                        <span aria-hidden="true">{up ? symbol.glyph : "▨"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {!allUp && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-sm text-text-muted">
                    Scrape all three.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setUncovered(marks.map((_, i) => i))}
                  >
                    Scrape the lot
                  </Button>
                </div>
              )}

              {/* The verdict only lands once the player has actually
                  uncovered all three — announcing it over a covered card
                  would make the scraping pointless. */}
              {allUp && won && (
                <InlineNotice tone="success" className="mt-3">
                  <strong>{outcome.label}.</strong>{" "}
                  {outcome.kind === "ITEM"
                    ? `${outcome.quantity > 1 ? `${outcome.quantity} × ` : ""}${outcome.itemName}, into the satchel.`
                    : outcome.kind === "JACKPOT"
                      ? "The pans, in full — "
                      : ""}
                  {outcome.kind !== "ITEM" && (
                    <CurrencyAmount amount={BigInt(outcome.coins)} />
                  )}
                  {state.replayed && " (already counted)"}
                </InlineNotice>
              )}
              {allUp && !won && (
                <InlineNotice
                  tone={nearMiss ? "warning" : "info"}
                  className="mt-3"
                >
                  {nearMiss
                    ? "Two of three. Salt, and more salt."
                    : "Salt, and more salt."}
                </InlineNotice>
              )}
            </>
          )}

          {state.error && (
            <InlineNotice tone="warning" className="mt-3">
              {state.error}
            </InlineNotice>
          )}

          <form action={dispatch} className="mt-5 flex justify-end gap-2">
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="idempotencyKey" value={attemptKey} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
            <SubmitButton
              pendingLabel="Scraping…"
              disabled={pending || remaining === 0}
            >
              {outcome === null ? "Scratch it" : "Another"}
            </SubmitButton>
          </form>
        </div>
      </Modal>
    </>
  );
}
