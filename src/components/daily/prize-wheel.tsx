"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WheelView } from "@/server/modules/daily/wheel/queries";
import type { SpinOutcome } from "@/server/modules/daily/wheel/spin";
import { spinWheelAction, type SpinActionState } from "@/server/actions/daily";
import { formatCoins, coinsFromJSON } from "@/lib/money";
import { InlineNotice } from "@/components/ui/inline-notice";
import { TextLink } from "@/components/ui/text-link";

/**
 * Daily prize wheel. The server commits the outcome before any animation
 * begins — the wheel merely rotates until the pointer sits on the segment
 * whose prizeId the server recorded. Segments render at EQUAL size with an
 * icon each (purely decorative; the real odds live server-side), and the
 * landing angle is computed from the rendered geometry, so the pointer
 * always stops on the rolled prize regardless of slice sizing. Respects
 * prefers-reduced-motion by replacing the long spin with a short
 * transition and immediate reveal.
 */

const SPIN_TURNS = 4;
const SPIN_MS = 2600;
const REDUCED_MS = 250;

const SEGMENT_FILLS = [
  "var(--color-surface-raised)",
  "var(--color-surface)",
];

/** Used when a prize has no configured icon. */
const FALLBACK_ICONS: Record<"COINS" | "ITEM_POOL" | "NOTHING", string> = {
  COINS: "🪙",
  ITEM_POOL: "🎁",
  NOTHING: "🍃",
};

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function segmentPath(startAngle: number, endAngle: number): string {
  const start = polar(50, 50, 48, startAngle);
  const end = polar(50, 50, 48, endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M 50 50 L ${start.x} ${start.y} A 48 48 0 ${large} 1 ${end.x} ${end.y} Z`;
}

/** Stable dry-humor line for NOTHING results (no client randomness). */
function flavorLine(flavorText: string, seed: string): string {
  const lines = flavorText.split("\n").filter(Boolean);
  if (lines.length === 0) {
    return "Better luck tomorrow.";
  }
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }
  return lines[hash % lines.length] as string;
}

/** The recorded result, whichever path it arrived by. */
interface RecordedResult {
  prizeId: string;
  prizeLabel: string;
  flavorText: string;
  rewardType: "COINS" | "ITEM" | "NOTHING";
  coinsAwarded: string;
  itemSlug: string | null;
  itemName: string | null;
  itemQuantity: number | null;
}

interface PrizeWheelProps {
  view: WheelView;
}

export function PrizeWheel({ view }: PrizeWheelProps) {
  const [state, dispatch, pending] = useActionState<SpinActionState, FormData>(
    spinWheelAction,
    { outcome: null, error: null, nonce: 0 },
  );
  const [rotation, setRotation] = useState(0);
  const [revealed, setRevealed] = useState<SpinOutcome | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Equal slices in display order. The landing target below is looked up
  // from THIS rendered geometry by prizeId, which is what keeps the
  // pointer honest even though slice size no longer encodes probability.
  const segments = useMemo(() => {
    const sweep = 360 / Math.max(view.segments.length, 1);
    return view.segments.map((segment, index) => ({
      ...segment,
      start: index * sweep,
      sweep,
      middle: index * sweep + sweep / 2,
    }));
  }, [view.segments]);

  // Animate to the committed outcome, then reveal the result panel. The
  // rotation is driven frame-by-frame in JS (not a CSS transition) so the
  // wheel ALWAYS comes to rest exactly on the server-recorded segment —
  // re-renders mid-flight (router refreshes, state updates) cannot restart
  // or desynchronize the animation.
  useEffect(() => {
    const outcome = state.outcome;
    if (!outcome) {
      if (state.error) {
        setAnnouncement(state.error);
      }
      return;
    }
    const segment = segments.find((s) => s.prizeId === outcome.prizeId);
    // Pointer sits at the top (0°); rotating by 360 − middle brings the
    // winning segment's center under it, plus SPIN_TURNS full turns.
    const target = segment
      ? SPIN_TURNS * 360 + (360 - segment.middle)
      : SPIN_TURNS * 360;
    const duration = reducedMotion ? REDUCED_MS : SPIN_MS;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      setRotation(easeOutCubic(progress) * target);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      setRevealed(outcome);
      setAnnouncement(
        outcome.rewardType === "COINS"
          ? `${outcome.prizeLabel}: you won ${formatCoins(coinsFromJSON(outcome.coinsAwarded))} coins.`
          : outcome.rewardType === "ITEM"
            ? `${outcome.prizeLabel}: you won ${outcome.itemName ?? "an item"}${(outcome.itemQuantity ?? 1) > 1 ? ` ×${outcome.itemQuantity}` : ""}.`
            : `${outcome.prizeLabel}. ${flavorLine(outcome.flavorText, outcome.gameDate + outcome.prizeId)}`,
      );
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state, segments, reducedMotion]);

  const spun = view.todaysSpin !== null || revealed !== null || state.outcome !== null;

  const spin = () => {
    if (pending || spun) {
      return;
    }
    idempotencyKey.current ??= crypto.randomUUID();
    const formData = new FormData();
    formData.set("idempotencyKey", idempotencyKey.current);
    startTransition(() => dispatch(formData));
  };

  // While an animation is in flight, the recorded result stays hidden —
  // even if a refreshed server view already carries today's spin.
  const recorded: RecordedResult | null =
    revealed ?? (state.outcome ? null : view.todaysSpin);

  return (
    <div>
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-full max-w-64">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-0 z-10 -translate-x-1/2 text-xl leading-none text-text"
          >
            ▼
          </div>
          <svg
            viewBox="0 0 100 100"
            role="img"
            aria-label={`Prize wheel with ${segments.length} segments: ${segments
              .map((s) => s.label)
              .join(", ")}`}
            className="w-full"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <circle cx="50" cy="50" r="49" fill="var(--color-border)" />
            {segments.map((segment, index) => {
              const won = recorded?.prizeId === segment.prizeId;
              return (
                <path
                  key={segment.prizeId}
                  d={segmentPath(segment.start, segment.start + segment.sweep)}
                  fill={
                    won
                      ? "var(--color-accent-soft)"
                      : SEGMENT_FILLS[index % SEGMENT_FILLS.length]
                  }
                  stroke={
                    won ? "var(--color-accent)" : "var(--color-border-strong)"
                  }
                  strokeWidth={won ? "1" : "0.4"}
                />
              );
            })}
            {segments.map((segment) => {
              const iconPos = polar(50, 50, 34, segment.middle);
              return (
                <text
                  key={`icon-${segment.prizeId}`}
                  x={iconPos.x}
                  y={iconPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="9"
                  aria-hidden="true"
                >
                  {segment.icon || FALLBACK_ICONS[segment.rewardType]}
                </text>
              );
            })}
            <circle cx="50" cy="50" r="6" fill="var(--color-border-strong)" />
          </svg>
        </div>

        {/* What the icons mean. Screen readers get this from the SVG's
            accessible name, so the legend is decorative for them. */}
        <ul
          aria-hidden="true"
          className="flex w-full flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-text-muted"
        >
          {segments.map((segment) => (
            <li key={`legend-${segment.prizeId}`} className="flex items-center gap-1">
              <span>{segment.icon || FALLBACK_ICONS[segment.rewardType]}</span>
              <span>{segment.label}</span>
            </li>
          ))}
        </ul>

        <div aria-live="polite" role="status" className="sr-only">
          {announcement}
        </div>

        {!spun && view.available && (
          <button
            type="button"
            onClick={spin}
            disabled={pending}
            aria-busy={pending}
            className="min-h-11 rounded-control bg-accent px-6 py-2 font-semibold text-accent-contrast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          >
            {pending ? "Spinning…" : "Spin the wheel"}
          </button>
        )}
        {state.error && (
          <InlineNotice tone="error" className="w-full">
            {state.error}
          </InlineNotice>
        )}
        {!view.available && !spun && (
          <p className="text-sm text-text-muted">The wheel is resting today.</p>
        )}

        {state.outcome && !revealed && (
          <p className="text-sm text-text-muted">The wheel is deciding…</p>
        )}

        {recorded && (
          <div
            className={`w-full max-w-md rounded-surface border p-4 text-center ${
              recorded.rewardType === "ITEM"
                ? "border-accent bg-accent-soft"
                : "border-border bg-surface-raised"
            }`}
          >
            <h3 className="font-display text-base font-semibold">
              {recorded.rewardType === "ITEM" && (
                <span aria-hidden="true">✨ </span>
              )}
              {recorded.prizeLabel}
            </h3>
            {recorded.rewardType === "COINS" && (
              <p className="mt-1 text-sm text-text">
                <span aria-hidden="true">🪙</span> You won{" "}
                {formatCoins(coinsFromJSON(recorded.coinsAwarded))} coins.
              </p>
            )}
            {recorded.rewardType === "ITEM" && (
              <p className="mt-1 text-sm text-text">
                You won {recorded.itemName}
                {(recorded.itemQuantity ?? 1) > 1
                  ? ` ×${recorded.itemQuantity}`
                  : ""}
                {recorded.itemSlug && (
                  <>
                    {" — "}
                    <TextLink href={`/items/${recorded.itemSlug}`}>
                      view item
                    </TextLink>
                  </>
                )}
                . It&apos;s in your satchel.
              </p>
            )}
            {recorded.rewardType === "NOTHING" && (
              <p className="mt-1 text-sm text-text-muted">
                {flavorLine(recorded.flavorText, recorded.prizeId)}
              </p>
            )}
            <p className="mt-2 text-xs text-text-muted">
              Come back tomorrow for another spin.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
