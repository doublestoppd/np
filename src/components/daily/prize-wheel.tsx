"use client";

import Link from "next/link";
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

/**
 * Daily prize wheel. The server commits the outcome before any animation
 * begins — the wheel merely rotates to the recorded segment. Segment sizes
 * are proportional to real weights. Respects prefers-reduced-motion by
 * replacing the spin with a short fade and immediate reveal.
 */

const SPIN_TURNS = 4;
const SPIN_MS = 2600;
const REDUCED_MS = 250;

const SEGMENT_FILLS = [
  "var(--color-surface-raised)",
  "var(--color-surface)",
];

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

  const segments = useMemo(() => {
    const total = view.segments.reduce((sum, s) => sum + s.weight, 0) || 1;
    let angle = 0;
    return view.segments.map((segment) => {
      const sweep = (segment.weight / total) * 360;
      const start = angle;
      angle += sweep;
      return { ...segment, start, sweep, middle: start + sweep / 2 };
    });
  }, [view.segments]);

  // Animate to the committed outcome, then reveal the result panel.
  useEffect(() => {
    const outcome = state.outcome;
    if (!outcome) {
      if (state.error) {
        setAnnouncement(state.error);
      }
      return;
    }
    const segment = segments.find((s) => s.prizeId === outcome.prizeId);
    const target = segment
      ? SPIN_TURNS * 360 + (360 - segment.middle)
      : SPIN_TURNS * 360;
    const duration = reducedMotion ? REDUCED_MS : SPIN_MS;
    setRotation(target);
    const timer = setTimeout(() => {
      setRevealed(outcome);
      setAnnouncement(
        outcome.rewardType === "COINS"
          ? `${outcome.prizeLabel}: you won ${formatCoins(coinsFromJSON(outcome.coinsAwarded))} coins.`
          : outcome.rewardType === "ITEM"
            ? `${outcome.prizeLabel}: you won ${outcome.itemName ?? "an item"}${(outcome.itemQuantity ?? 1) > 1 ? ` ×${outcome.itemQuantity}` : ""}.`
            : `${outcome.prizeLabel}. ${flavorLine(outcome.flavorText, outcome.gameDate + outcome.prizeId)}`,
      );
    }, duration + 50);
    return () => clearTimeout(timer);
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

  const recorded: RecordedResult | null = revealed ?? view.todaysSpin;

  return (
    <section aria-labelledby="wheel-heading">
      <h2 id="wheel-heading" className="font-display text-lg font-semibold">
        {view.wheelName}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-text-muted">
        One spin a day. Coins, curiosities, or a valuable lesson in
        probability — resets at midnight UTC.
      </p>

      <div className="mt-4 flex flex-col items-center gap-4">
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
            aria-label={`Prize wheel with ${segments.length} segments sized by likelihood: ${segments
              .map((s) => s.label)
              .join(", ")}`}
            className="w-full"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: state.outcome
                ? `transform ${reducedMotion ? REDUCED_MS : SPIN_MS}ms cubic-bezier(0.2, 0.6, 0.2, 1)`
                : undefined,
            }}
          >
            <circle cx="50" cy="50" r="49" fill="var(--color-border)" />
            {segments.map((segment, index) => (
              <path
                key={segment.prizeId}
                d={segmentPath(segment.start, segment.start + segment.sweep)}
                fill={SEGMENT_FILLS[index % SEGMENT_FILLS.length]}
                stroke="var(--color-border-strong)"
                strokeWidth="0.4"
              />
            ))}
            {segments.map((segment) => {
              const labelPos = polar(50, 50, 33, segment.middle);
              return (
                <text
                  key={`label-${segment.prizeId}`}
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${segment.middle} ${labelPos.x} ${labelPos.y})`}
                  className="fill-[var(--color-text-muted)]"
                  fontSize="3.4"
                >
                  {segment.label.length > 14
                    ? `${segment.label.slice(0, 13)}…`
                    : segment.label}
                </text>
              );
            })}
            <circle cx="50" cy="50" r="6" fill="var(--color-border-strong)" />
          </svg>
        </div>

        <div aria-live="polite" role="status" className="sr-only">
          {announcement}
        </div>

        {!spun && view.available && (
          <button
            type="button"
            onClick={spin}
            disabled={pending}
            className="min-h-11 rounded-control bg-accent px-6 py-2 font-semibold text-accent-contrast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          >
            {pending ? "Spinning…" : "Spin the wheel"}
          </button>
        )}
        {state.error && (
          <p className="rounded-control border border-border bg-surface-raised px-3 py-2 text-sm text-text">
            {state.error}
          </p>
        )}
        {!view.available && !spun && (
          <p className="text-sm text-text-muted">The wheel is resting today.</p>
        )}

        {state.outcome && !revealed && !view.todaysSpin && (
          <p className="text-sm text-text-muted">The wheel is deciding…</p>
        )}

        {recorded && (
          <div className="w-full max-w-md rounded-surface border border-border bg-surface-raised p-4 text-center">
            <h3 className="font-display text-base font-semibold">
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
                    <Link
                      href={`/items/${recorded.itemSlug}`}
                      className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      view item
                    </Link>
                  </>
                )}
                . It&apos;s in your inventory.
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
    </section>
  );
}
