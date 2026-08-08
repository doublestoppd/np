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
 *
 * **Steering is HELD, not toggled.** A steering game gets pointer-down to
 * lean, pointer-up to let go, and a thumb dragged across the middle
 * changes direction without lifting. Getting the release wrong is not a
 * small bug in a game like this — it is the difference between steering
 * and setting a course.
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

  const held = useRef(false);
  const leaning = useRef<-1 | 0 | 1>(0);
  const steer = useCallback(
    (direction: -1 | 0 | 1) => {
      // Repeats are dropped here rather than in the loop: a pointermove
      // fires many times a second, and every one that reached the trace
      // would be an event recording nothing new — burning the event
      // budget and tripping the minimum-spacing check on honest play.
      if (leaning.current === direction) return;
      leaning.current = direction;
      onSteer?.(direction);
    },
    [onSteer],
  );

  /** Which half of the stage a point is in. */
  const sideOf = (element: HTMLElement, clientX: number): -1 | 1 => {
    const box = element.getBoundingClientRect();
    return clientX - box.left < box.width / 2 ? -1 : 1;
  };

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
            // are touching is the way you lean, for as long as you hold
            // it. Simpler than a d-pad, and it puts the control under
            // whichever thumb is already there.
            held.current = true;
            // Capture keeps the drag on this element even if the thumb
            // strays outside it. Guarded: a synthetic pointer that is no
            // longer active throws, and losing the capture must not take
            // the lean with it.
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Not fatal — pointermove still reaches the element.
            }
            steer(sideOf(event.currentTarget, event.clientX));
          } else {
            onPrimary();
          }
        }}
        onPointerMove={(event) => {
          // Sliding a thumb across the middle turns round without lifting,
          // which is how a held control should behave.
          if (!onSteer || !held.current) return;
          steer(sideOf(event.currentTarget, event.clientX));
        }}
        onPointerUp={() => {
          held.current = false;
          if (onSteer) steer(0);
        }}
        onPointerCancel={() => {
          held.current = false;
          if (onSteer) steer(0);
        }}
        onPointerLeave={() => {
          // A pointer that leaves the stage entirely is a release. With
          // capture set this rarely fires mid-drag, but a lost pointer
          // that left the lean stuck on would be the original bug again.
          held.current = false;
          if (onSteer) steer(0);
        }}
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
