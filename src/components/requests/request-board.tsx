"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { RequestBoardView } from "@/server/modules/requests/queries";
import {
  requestBoardAction,
  type RequestBoardActionState,
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
 * rewards, or which request is next. The response carries the whole board
 * as it now stands, so delivering or setting a request aside repaints the
 * list without a full-page navigation, and a stale conflict is answered
 * with the authoritative state rather than an error the player must
 * refresh past.
 */
/**
 * Lives here rather than beside the action: a "use server" module may only
 * export async functions, so a constant there is a runtime error the type
 * checker and the production build both accept.
 */
const INITIAL_STATE: RequestBoardActionState = {
  outcome: null,
  error: null,
  view: null,
  replayed: false,
  nonce: 0,
};

export function RequestBoard({ view: initialView }: { view: RequestBoardView }) {
  const [state, dispatch, pending] = useActionState<
    RequestBoardActionState,
    FormData
  >(requestBoardAction, INITIAL_STATE);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [seenNonce, setSeenNonce] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const resultRef = useRef<HTMLDivElement | null>(null);

  // The server's copy wins once it has spoken; until then, what the page
  // was rendered with. Counting or advancing locally would disagree with it.
  const view = state.view ?? initialView;

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
    if (state.outcome?.kind === "completed") {
      const { completion } = state.outcome;
      const reward = formatCoins(coinsFromJSON(completion.rewardCoins));
      const balance = formatCoins(coinsFromJSON(completion.newBalance));
      setAnnouncement(
        state.replayed
          ? `Already delivered: ${completion.requestTitle}. Your balance is ${balance} coins.`
          : `Delivered ${completion.requestTitle}. You earned ${reward} coins; your balance is ${balance} coins.` +
              (completion.nextRequestTitle
                ? ` Next up: ${completion.nextRequestTitle}.`
                : ""),
      );
      resultRef.current?.focus();
      return;
    }
    if (state.outcome?.kind === "skipped") {
      const { skip } = state.outcome;
      setAnnouncement(
        `Set aside ${skip.skippedTitle}. Now posted: ${skip.nextRequestTitle}.`,
      );
      resultRef.current?.focus();
    }
  }, [state, seenNonce]);

  const stateVersion = view.stateVersion;
  const capReached = view.remainingToday <= 0;
  const completion =
    state.outcome?.kind === "completed" ? state.outcome.completion : null;
  const skip = state.outcome?.kind === "skipped" ? state.outcome.skip : null;

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
  // Setting a request aside is free and costs nothing, so it stays offered
  // even after the daily cap — looking ahead at tomorrow's work is allowed.
  const canSkip = view.hasOtherRequests && !pending;

  const submit = (formData: FormData) =>
    startTransition(() => dispatch(formData));

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

      {completion && (
        <div
          ref={resultRef}
          tabIndex={-1}
          className="mb-3 rounded-surface border border-accent bg-accent-soft p-4"
        >
          <h3 className="font-display text-base font-semibold">
            {state.replayed ? "Already delivered" : "Delivered — thank you"}
          </h3>
          <p className="mt-1 text-sm text-text">
            {completion.requestTitle} ·{" "}
            <CurrencyAmount
              amount={coinsFromJSON(completion.rewardCoins)}
              delta
            />
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Balance:{" "}
            <CurrencyAmount amount={coinsFromJSON(completion.newBalance)} />
          </p>
        </div>
      )}

      {skip && (
        <div
          ref={resultRef}
          tabIndex={-1}
          className="mb-3 rounded-surface border border-border bg-surface p-4"
        >
          <h3 className="font-display text-base font-semibold">
            Set aside for now
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            {skip.skippedTitle} goes back on the board. It will come round
            again — nothing was lost.
          </p>
        </div>
      )}

      <h3 className="font-display text-base font-semibold text-text">
        {current.title}
      </h3>
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

      <div className="mt-3 flex flex-wrap gap-2">
        <form action={submit}>
          <input type="hidden" name="intent" value="complete" />
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

        {view.hasOtherRequests && (
          <form action={submit}>
            <input type="hidden" name="intent" value="skip" />
            <input type="hidden" name="boardKey" value={view.boardKey} />
            <input
              type="hidden"
              name="expectedStateVersion"
              value={stateVersion}
            />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <Button type="submit" variant="secondary" disabled={!canSkip}>
              Ask for a different one
            </Button>
          </form>
        )}
      </div>

      {!current.deliverable && !capReached && (
        <p className="mt-2 text-sm text-text-muted">
          Bring everything on the list and the kitchen will take it from
          there. Nothing is taken until you deliver.
          {view.hasOtherRequests
            ? " Or ask for a different one — it costs nothing, and this one comes back round."
            : ""}
        </p>
      )}
      {capReached && (
        <p className="mt-2 text-sm text-text-muted">
          That&apos;s all the kitchen needs today. This request is still
          yours — it will be waiting after the reset at midnight UTC.
        </p>
      )}

      <p className="mt-3 text-xs text-text-muted">
        Daily work completed: {view.completedToday} of {view.dailyLimit}
      </p>
    </div>
  );
}
