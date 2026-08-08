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
import {
  SLOT_FACES,
  faceAt,
  isNearMissReels,
  parseReels,
} from "@/lib/games/slot-faces";
import type { SlotActionState } from "@/server/actions/slots";
import { spinSlotsAction } from "@/server/actions/slots";
import type { SlotMachineView } from "@/server/modules/slots/queries";
import { Button, LinkButton } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { InlineNotice } from "@/components/ui/inline-notice";

/**
 * The Tumblehouse drums (ADR-49).
 *
 * The three faces are decided and recorded by the server before this
 * renders anything — the spinning is theatre over a settled result, which
 * is what every machine of this kind has always been. Nothing here can
 * change what was landed; a drum coming to rest is a local reveal of a
 * fact the database already holds.
 *
 * **The drums stop left to right, and the last one takes the longest.**
 * That ordering is the whole feature. A pair on the first two drums with
 * the third still turning is what a near miss *is*, and near misses are
 * drawn deliberately often (reels.ts) precisely so this moment happens.
 *
 * What the interface must not do is let the player mistake that moment for
 * information. The near miss is dressing chosen after the loss was drawn,
 * so it carries none: it gets the same tone and the same plainness as any
 * other losing pull, and the copy says outright that a pair pays nothing.
 *
 * Timings are driven frame-by-frame in JS rather than by CSS transitions,
 * for the reason the prize wheel gives: a re-render mid-flight cannot
 * restart or desynchronise the animation, so the drums always come to
 * rest on the server-recorded faces.
 *
 * `prefers-reduced-motion` collapses the whole sequence to a short,
 * simultaneous settle — the result is identical, and nobody has to watch
 * anything tumble to find out what they got.
 */

/** How long each drum turns before it settles, in order. */
const STOP_MS = [900, 1500, 2300];
const REDUCED_STOP_MS = [140, 200, 260];
/** How fast a turning drum cycles through faces. */
const TICK_MS = 70;

type Phase = "idle" | "spinning" | "settled";

export function TumblehouseDrums({ view }: { view: SlotMachineView }) {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState<SlotActionState, FormData>(
    spinSlotsAction,
    { outcome: null, error: null, replayed: false, nonce: 0 },
  );

  /** Which tier the player has selected to feed in. */
  const [selected, setSelected] = useState(
    () => view.tokens.find((token) => token.owned > 0)?.itemId ?? view.tokens[0]?.itemId ?? "",
  );
  /** Faces currently shown on each drum while it turns. */
  const [faces, setFaces] = useState<number[]>([0, 1, 2]);
  /** How many drums have come to rest, 0-3. */
  const [stopped, setStopped] = useState(3);
  const [phase, setPhase] = useState<Phase>("idle");
  /**
   * Tokens fed in since the last server payload, so counts are right
   * without a refetch after every pull.
   *
   * This is an optimistic overlay on `view.tokens[].owned`, and it MUST be
   * discarded the moment fresh server data arrives — otherwise the two
   * decrements stack. A win called `router.refresh()`, which lowered
   * `owned`, while `spent` kept its own tally: three pulls with one win
   * showed ×6 against a real 9, and a small stack reached a disabled
   * "No token" lever while the player still held tokens they had paid for.
   *
   * The signature is the fix and the reset below is the whole mechanism:
   * any change to what the server says about ownership means this overlay
   * is describing a world that no longer exists.
   */
  const [spent, setSpent] = useState<Record<string, number>>({});
  const ownedSignature = view.tokens
    .map((entry) => `${entry.itemId}:${entry.owned}`)
    .join("|");
  const [seenSignature, setSeenSignature] = useState(ownedSignature);
  if (seenSignature !== ownedSignature) {
    // Adjusting state during render, deliberately: React re-renders
    // immediately without committing, so the counts below are never drawn
    // stale for a frame.
    setSeenSignature(ownedSignature);
    setSpent({});
  }
  const [announcement, setAnnouncement] = useState("");
  /**
   * The last result this has animated.
   *
   * A ref, not state, and the effect below depends on `state` alone. Both
   * are load-bearing: writing this as state re-ran the effect, and the
   * first run's cleanup then cleared every pending timer before it fired,
   * so the drums started turning and never stopped. The same trap catches
   * any other value in the dependency array that this effect itself
   * changes.
   */
  const handledNonce = useRef(0);
  const attemptKey = useRef<string | null>(null);

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const token = view.tokens.find((entry) => entry.itemId === selected) ?? null;
  const remaining = token
    ? Math.max(0, token.owned - (spent[token.itemId] ?? 0))
    : 0;

  // A new result arrived: start the drums, and count the token that went.
  useEffect(() => {
    const outcome = state.outcome;
    if (!outcome || state.nonce === handledNonce.current) {
      if (state.error) setAnnouncement(state.error);
      return;
    }
    handledNonce.current = state.nonce;
    setSpent((counts) => ({
      ...counts,
      [outcome.tokenItemId]: (counts[outcome.tokenItemId] ?? 0) + 1,
    }));
    // The next pull needs its own key. Deriving it from a render count
    // instead would replay the previous pull whenever this remounted.
    attemptKey.current = null;

    const landed = parseReels(outcome.reels);
    // The drum size of the token that was FED IN, not whatever is
    // selected now. Reading it here also keeps it out of the dependency
    // array, where it would restart the animation on a selection change.
    const drumFaces =
      view.tokens.find((entry) => entry.itemId === outcome.tokenItemId)?.faces ??
      SLOT_FACES.length;
    const stops = reducedMotion ? REDUCED_STOP_MS : STOP_MS;
    const timers: ReturnType<typeof setTimeout>[] = [];

    setPhase("spinning");
    setStopped(0);
    setAnnouncement("The drums are turning.");

    // Every unstopped drum cycles faces; a stopped one holds its landed
    // face. `settledCount` is read from state at tick time so a drum that
    // has stopped never flickers again.
    let settledCount = 0;
    const cycle = setInterval(() => {
      setFaces((current) =>
        current.map((face, index) =>
          index < settledCount
            ? (landed[index] ?? face)
            : (face + 1) % Math.max(drumFaces, 1),
        ),
      );
    }, TICK_MS);

    for (const [index, delay] of stops.entries()) {
      timers.push(
        setTimeout(() => {
          settledCount = index + 1;
          setStopped(index + 1);
          setFaces((current) =>
            current.map((face, i) => (i <= index ? (landed[i] ?? face) : face)),
          );
        }, delay),
      );
    }
    timers.push(
      setTimeout(
        () => {
          clearInterval(cycle);
          setFaces(landed.length === 3 ? landed : [0, 1, 2]);
          setPhase("settled");
          // The wallet chip is server-rendered, so a win left it stale
          // until the next navigation. Refreshing HERE rather than in the
          // action is the whole point: a revalidation while the drums
          // were turning would remount them mid-spin.
          if (outcome.won) {
            router.refresh();
          }
          setAnnouncement(
            outcome.won
              ? outcome.kind === "ITEM"
                ? `${outcome.label}. You won ${outcome.quantity > 1 ? `${outcome.quantity} ` : ""}${outcome.itemName ?? "an item"}.`
                : `${outcome.label}. You won ${formatCoins(BigInt(outcome.coins))} coins.`
              : isNearMissReels(landed)
                ? "Two of three. Nothing."
                : "Nothing.",
          );
        },
        (stops[stops.length - 1] ?? 0) + 120,
      ),
    );

    return () => {
      clearInterval(cycle);
      for (const timer of timers) clearTimeout(timer);
    };
  }, [state, reducedMotion, view.tokens, router]);

  const outcome = state.outcome;
  const landed = outcome ? parseReels(outcome.reels) : [];
  const spinning = phase === "spinning";
  const settled = phase === "settled" && outcome !== null;
  // Held back until every drum has stopped: announcing the result over a
  // turning drum would make the turning pointless.
  const verdict = settled ? outcome : null;
  const nearMiss = settled && !outcome.won && isNearMissReels(landed);

  const pull = () => {
    if (pending || spinning || !token || remaining === 0) return;
    attemptKey.current ??= crypto.randomUUID();
    const formData = new FormData();
    formData.set("itemId", token.itemId);
    formData.set("idempotencyKey", attemptKey.current);
    startTransition(() => dispatch(formData));
  };

  return (
    <div>
      {/* ---- The drums ------------------------------------------------ */}
      <div className="rounded-panel border border-border-strong bg-surface-sunken p-4">
        <ul className="flex items-center justify-center gap-2 sm:gap-3">
          {[0, 1, 2].map((drum) => {
            const face = faceAt(faces[drum] ?? 0);
            const turning = spinning && stopped <= drum;
            return (
              <li key={drum}>
                <div
                  className={`flex size-20 items-center justify-center overflow-hidden rounded-control border-2 bg-surface text-4xl transition-[border-color,transform] sm:size-24 sm:text-5xl ${
                    turning
                      ? "border-border-strong"
                      : settled && outcome.won
                        ? "border-accent scale-105"
                        : "border-border"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={turning ? "blur-[1px] opacity-80" : ""}
                  >
                    {face.glyph}
                  </span>
                </div>
                <p className="mt-1 text-center text-xs text-text-muted">
                  {turning ? "…" : face.name}
                </p>
              </li>
            );
          })}
        </ul>

        {/* The screen-reader channel. The drums themselves are decorative
            glyphs; this is where the actual result is announced, once. */}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {verdict && verdict.won && (
          <InlineNotice tone="success" className="mt-3">
            <strong>{verdict.label}.</strong>{" "}
            {verdict.kind === "ITEM" ? (
              `${verdict.quantity > 1 ? `${verdict.quantity} × ` : ""}${verdict.itemName}, into the satchel.`
            ) : (
              <CurrencyAmount amount={BigInt(verdict.coins)} />
            )}
            {state.replayed && " (already counted)"}
          </InlineNotice>
        )}
        {/* A near miss is a loss and is told the same way, in the same
            tone. The old copy ("the third drum takes its time on purpose")
            invited the player to read a pair as nearly winning; it is not,
            because the loss was drawn before any face was chosen. */}
        {verdict && !verdict.won && (
          <InlineNotice tone="info" className="mt-3">
            {nearMiss
              ? "Two of three, which pays exactly what none of three pays."
              : "The drums disagree. Nothing this time."}
          </InlineNotice>
        )}
        {state.error && (
          <InlineNotice tone="warning" className="mt-3">
            {state.error}
          </InlineNotice>
        )}
      </div>

      {/* ---- Choosing a token ----------------------------------------- */}
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-text">
          Which token
        </legend>
        <ul className="mt-2 grid gap-2">
          {view.tokens.map((entry) => {
            const held = Math.max(0, entry.owned - (spent[entry.itemId] ?? 0));
            const active = entry.itemId === selected;
            return (
              <li key={entry.itemId}>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2 ${
                    active
                      ? "border-accent bg-accent/5"
                      : "border-border bg-surface"
                  }`}
                >
                  <input
                    type="radio"
                    name="token"
                    value={entry.itemId}
                    checked={active}
                    disabled={spinning}
                    onChange={() => setSelected(entry.itemId)}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text">
                      {entry.name}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {entry.faces} faces · top:{" "}
                      {entry.topPrize
                        ? entry.topPrize.kind === "COINS"
                          ? `${formatCoins(BigInt(entry.topPrize.coins))} coins`
                          : (entry.topPrize.itemName ?? entry.topPrize.label)
                        : "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-text-muted">
                    {held > 0 ? `×${held}` : "none"}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={pull}
          disabled={pending || spinning || remaining === 0}
        >
          {spinning ? "Turning…" : remaining === 0 ? "No token" : "Pull the lever"}
        </Button>
        {settled && remaining > 0 && (
          <span className="text-sm text-text-muted">
            {remaining === 1 ? "One left" : `${remaining} left`}
          </span>
        )}
        {remaining === 0 && (
          <LinkButton
            href="/explore/saltmere/the-tumblehouse"
            variant="secondary"
            onClick={() => router.refresh()}
          >
            Buy tokens
          </LinkButton>
        )}
      </div>

      {/* ---- What is on this drum -------------------------------------- */}
      {token && token.prizes.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-text-muted">
            What&apos;s on the {token.name.toLowerCase()} drum
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-text-muted">
            {token.prizes.map((prize) => (
              <li key={prize.label} className="flex items-baseline gap-2">
                <span aria-hidden="true" className="text-base">
                  {faceAt(prize.faceIndex).glyph}
                </span>
                <span>
                  <span className="sr-only">
                    Three {faceAt(prize.faceIndex).name}:{" "}
                  </span>
                  {prize.kind === "COINS"
                    ? `${formatCoins(BigInt(prize.coins))} coins`
                    : `${prize.quantity > 1 ? `${prize.quantity} × ` : ""}${prize.itemName}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-text-muted">
            Three of a face pays. Anything else does not.
          </p>
        </details>
      )}
    </div>
  );
}
