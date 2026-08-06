"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { RequestBoardView } from "@/server/modules/requests/queries";
import {
  completeRequestAction,
  type CompleteRequestActionState,
} from "@/server/actions/requests";
import { coinsFromJSON, formatCoins } from "@/lib/money";
import { ItemArt } from "@/components/art/item-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineNotice } from "@/components/ui/inline-notice";

/**
 * Request board player interface. Every value shown after an action comes
 * from the server's response — the client never computes completion,
 * rewards, or which request is next. A stale state token is answered with
 * the authoritative version, so the next attempt succeeds without a
 * full-page navigation.
 */
export function RequestBoard({ view }: { view: RequestBoardView }) {
  const [state, dispatch, pending] = useActionState<
    CompleteRequestActionState,
    FormData
  >(completeRequestAction, {
    result: null,
    error: null,
    stateVersion: null,
    replayed: false,
    nonce: 0,
  });
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [seenNonce, setSeenNonce] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const resultRef = useRef<HTMLDivElement | null>(null);

  // Fold each server response into the announcement and move focus to the
  // result so keyboard and screen-reader users land on what changed.
  useEffect(() => {
    if (state.nonce === seenNonce) {
      return;
    }
    setSeenNonce(state.nonce);
    setIdempotencyKey(crypto.randomUUID());
    if (state.error) {
      setAnnouncement(state.error);
      return;
    }
    if (state.result) {
      const reward = formatCoins(coinsFromJSON(state.result.rewardCoins));
      const balance = formatCoins(coinsFromJSON(state.result.newBalance));
      setAnnouncement(
        state.replayed
          ? `Already delivered: ${state.result.requestTitle}. Your balance is ${balance} coins.`
          : `Delivered ${state.result.requestTitle}. You earned ${reward} coins; your balance is ${balance} coins.` +
              (state.result.nextRequestTitle
                ? ` Next up: ${state.result.nextRequestTitle}.`
                : ""),
      );
      resultRef.current?.focus();
    }
  }, [state, seenNonce]);

  // Everything shown comes from the server: the action's response carries
  // the authoritative state version, and completing triggers a refresh
  // that re-renders this component with a fresh view. Counting locally
  // would double-count once that refresh lands.
  const stateVersion = state.stateVersion ?? view.stateVersion;
  const completedToday = view.completedToday;
  const capReached = view.remainingToday <= 0;

  if (!view.available || !view.current) {
    return (
      <EmptyState
        icon="📋"
        headingAs="h3"
        title="Nothing posted right now"
        description="The board is empty. Requests return when the kitchen thinks of something."
      />
    );
  }

  const current = view.current;
  const canComplete = current.deliverable && !capReached && !pending;

  return (
    <div>
      {/* One live region for results and errors. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {state.error && (
        <InlineNotice tone="error" className="mb-3">
          {state.error}
        </InlineNotice>
      )}

      {state.result && (
        <div
          ref={resultRef}
          tabIndex={-1}
          className="mb-3 rounded-surface border border-accent bg-accent-soft p-4"
        >
          <h4 className="font-display text-base font-semibold">
            {state.replayed ? "Already delivered" : "Delivered — thank you"}
          </h4>
          <p className="mt-1 text-sm text-text">
            {state.result.requestTitle} ·{" "}
            <CurrencyAmount
              amount={coinsFromJSON(state.result.rewardCoins)}
              delta
            />
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Balance:{" "}
            <CurrencyAmount amount={coinsFromJSON(state.result.newBalance)} />
          </p>
        </div>
      )}

      <h4 className="font-display text-base font-semibold text-text">
        {current.title}
      </h4>
      {current.flavorText && (
        <p className="mt-1 max-w-prose text-sm text-text-muted">
          {current.flavorText}
        </p>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {current.requirements.map((requirement) => {
          const met = requirement.owned >= requirement.required;
          return (
            <li
              key={requirement.itemId}
              className="flex items-center gap-3 rounded-control border border-border bg-surface p-2"
            >
              <ArtworkFrame aspect="square" className="w-12 shrink-0">
                <ItemArt
                  artKey={requirement.itemArtKey}
                  categorySlug={requirement.itemCategorySlug ?? undefined}
                  label=""
                />
              </ArtworkFrame>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">
                  {requirement.itemName}
                </p>
                <p className="text-xs text-text-muted">
                  {/* Icon + wording carry the state, never color alone. */}
                  <span aria-hidden="true">{met ? "✓ " : "• "}</span>
                  Owned {requirement.owned} of {requirement.required}
                  {met ? "" : ` — need ${requirement.required - requirement.owned} more`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-sm">
        Reward: <CurrencyAmount amount={coinsFromJSON(current.rewardCoins)} />
      </p>

      <form
        className="mt-3"
        action={(formData) => startTransition(() => dispatch(formData))}
      >
        <input type="hidden" name="boardKey" value={view.boardKey} />
        <input
          type="hidden"
          name="expectedStateVersion"
          value={stateVersion}
        />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <Button type="submit" disabled={!canComplete} aria-busy={pending}>
          {pending ? "Delivering…" : "Complete request"}
        </Button>
      </form>

      {!current.deliverable && !capReached && (
        <p className="mt-2 text-sm text-text-muted">
          Bring everything on the list and the kitchen will take it from
          there. Nothing is taken until you deliver.
        </p>
      )}
      {capReached && (
        <p className="mt-2 text-sm text-text-muted">
          That&apos;s all the kitchen needs today. This request is still
          yours — it will be waiting after the reset at midnight UTC.
        </p>
      )}

      <p className="mt-3 text-xs text-text-muted">
        Daily work completed: {completedToday} of {view.dailyLimit}
      </p>
    </div>
  );
}
