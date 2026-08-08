"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The canvas both arcade games draw on (ADR-62).
 *
 * Owns everything about the surface that is not the game: device-pixel
 * scaling, the aspect ratio, the input surface, and the accessibility
 * story. A game passes a `draw` function that receives a context already
 * scaled to a fixed logical size, so neither game contains a single
 * `devicePixelRatio` or a single `getBoundingClientRect`.
 *
 * **Mobile first, and the aspect ratio is the reason.** At 360px the stage
 * is 360 wide, and it is taller than it is wide because both games are
 * about vertical position — a letterbox would leave a phone player
 * squinting at a strip. The logical coordinate space is fixed, so the same
 * course looks the same on every screen and nobody gets a wider view of
 * what is coming by owning a bigger phone.
 *
 * **Input.** Pointer anywhere on the stage, and the keyboard. The canvas is
 * a `button` rather than a bare canvas so it is focusable, reachable by
 * tab, and announced — a canvas with a click handler is invisible to
 * anything that is not a mouse.
 */

export interface ArcadeStageProps {
  /** Logical size. The canvas is scaled to this, whatever its real size. */
  width: number;
  height: number;
  /** Called every animation frame with a context scaled to the above. */
  draw: (ctx: CanvasRenderingContext2D) => void;
  /** Pointer down, or the primary key. */
  onPrimary: () => void;
  /** Held direction, for the games that steer. -1, 0 or 1. */
  onSteer?: (direction: -1 | 0 | 1) => void;
  label: string;
  /** Live text for anybody not looking at the canvas. */
  status: string;
}

export function ArcadeStage({
  width,
  height,
  draw,
  onPrimary,
  onSteer,
  label,
  status,
}: ArcadeStageProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    let frame = 0;
    const paint = () => {
      frame = requestAnimationFrame(paint);
      const element = canvas.current;
      if (!element) return;
      const ctx = element.getContext("2d");
      if (!ctx) return;

      // Re-checked every frame rather than once: a phone rotating, a
      // desktop window resizing and a browser zoom all change this, and
      // none of them fire an event this component would otherwise see.
      const ratio = Math.min(3, window.devicePixelRatio || 1);
      const targetW = Math.round(width * ratio);
      const targetH = Math.round(height * ratio);
      if (element.width !== targetW || element.height !== targetH) {
        element.width = targetW;
        element.height = targetH;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawRef.current(ctx);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [width, height]);

  const steer = useCallback(
    (direction: -1 | 0 | 1) => onSteer?.(direction),
    [onSteer],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === "ArrowLeft" || event.key === "a") {
        event.preventDefault();
        steer(-1);
        return;
      }
      if (event.key === "ArrowRight" || event.key === "d") {
        event.preventDefault();
        steer(1);
        return;
      }
      if (event.key === " " || event.key === "Enter" || event.key === "ArrowUp") {
        event.preventDefault();
        onPrimary();
      }
    },
    [onPrimary, steer],
  );

  const onKeyUp = useCallback(
    (event: React.KeyboardEvent) => {
      if (
        event.key === "ArrowLeft" ||
        event.key === "a" ||
        event.key === "ArrowRight" ||
        event.key === "d"
      ) {
        event.preventDefault();
        steer(0);
      }
    },
    [steer],
  );

  return (
    <div className="w-full">
      <button
        type="button"
        aria-label={label}
        className="block w-full touch-none rounded-control border border-border bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        style={{ aspectRatio: `${width} / ${height}` }}
        onPointerDown={(event) => {
          // The canvas takes focus on the first tap so the keyboard works
          // straight afterwards without a second, invisible interaction.
          event.currentTarget.focus();
          event.preventDefault();
          if (onSteer) {
            // Steering games split the stage down the middle: the half you
            // touch is the way you lean. Simpler than a d-pad, and it puts
            // the control under whichever thumb is already there.
            const box = event.currentTarget.getBoundingClientRect();
            steer(event.clientX - box.left < box.width / 2 ? -1 : 1);
          } else {
            onPrimary();
          }
        }}
        onPointerUp={() => onSteer && steer(0)}
        onPointerCancel={() => onSteer && steer(0)}
        onPointerLeave={() => onSteer && steer(0)}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        <canvas
          ref={canvas}
          className="block h-full w-full rounded-control"
          // Presentation only: everything it shows is in `status` below,
          // which is what a screen reader is given.
          aria-hidden="true"
        />
      </button>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}
