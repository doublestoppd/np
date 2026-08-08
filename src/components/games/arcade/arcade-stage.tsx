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
 *
 * **A four-way game gets swipes.** Drag any distance and the direction is
 * the larger of the two axes; a tap that goes nowhere falls back to which
 * quarter of the stage it landed in, so a stab at the top edge means up.
 * Both, because a swipe is what a thumb wants and a tap is what an
 * impatient thumb actually does.
 */

export interface ArcadeStageProps {
  /** How this game is controlled. Decides the pointer and key handling. */
  control: "tap" | "lean" | "compass";
  /** Logical size. The canvas is scaled to this, whatever its real size. */
  width: number;
  height: number;
  /** Called every animation frame with a context scaled to the above. */
  draw: (ctx: CanvasRenderingContext2D) => void;
  /** Pointer down, or the primary key. */
  onPrimary: () => void;
  /** Held direction, for the games that steer. -1, 0 or 1. */
  onSteer?: (direction: -1 | 0 | 1) => void;
  /** Compass direction, for the games that turn. 1 up, 2 right, 3 down, 4 left. */
  onDirection?: (direction: 1 | 2 | 3 | 4) => void;
  label: string;
  /** Live text for anybody not looking at the canvas. */
  status: string;
}

export function ArcadeStage({
  control,
  width,
  height,
  draw,
  onPrimary,
  onSteer,
  onDirection,
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

  /** Where a four-way drag started, so its direction can be measured. */
  const from = useRef<{ x: number; y: number } | null>(null);
  /** Below this a drag is a tap, and the quarter it landed in decides. */
  const SWIPE_PX = 16;

  const quarterOf = (
    element: HTMLElement,
    clientX: number,
    clientY: number,
  ): 1 | 2 | 3 | 4 => {
    const box = element.getBoundingClientRect();
    // Normalised to the centre so the four quarters are triangles rather
    // than rectangles: a tap near a corner picks the axis it is furthest
    // along, which is what a thumb aiming at "up" is doing.
    const dx = (clientX - box.left) / box.width - 0.5;
    const dy = (clientY - box.top) / box.height - 0.5;
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 4 : 2;
    return dy < 0 ? 1 : 3;
  };

  /**
   * The keyboard, dispatched on the control mode rather than on which
   * callbacks happen to be set.
   *
   * Inferring the mode is what broke it: the old handler fell through to
   * `onPrimary` for ArrowUp, Space and Enter in every mode, and in a
   * steering game `onPrimary` sends code 1 — so pressing Up on The Long
   * Way Up leaned the climber left. Every game accepts the arrow keys, and
   * each one accepts the arrows that mean something in it.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key;

      if (control === "compass") {
        const direction =
          key === "ArrowUp" || key === "w"
            ? 1
            : key === "ArrowRight" || key === "d"
              ? 2
              : key === "ArrowDown" || key === "s"
                ? 3
                : key === "ArrowLeft" || key === "a"
                  ? 4
                  : 0;
        if (direction === 0) return;
        event.preventDefault();
        onDirection?.(direction);
        return;
      }

      if (control === "lean") {
        const direction =
          key === "ArrowLeft" || key === "a"
            ? -1
            : key === "ArrowRight" || key === "d"
              ? 1
              : null;
        if (direction === null) return;
        event.preventDefault();
        steer(direction);
        return;
      }

      if (key === " " || key === "Enter" || key === "ArrowUp" || key === "w") {
        event.preventDefault();
        onPrimary();
      }
    },
    [control, onDirection, onPrimary, steer],
  );

  const onKeyUp = useCallback(
    (event: React.KeyboardEvent) => {
      // Only steering has a release. Letting go is an input of its own
      // there, and nowhere else.
      if (control !== "lean") return;
      const key = event.key;
      if (
        key === "ArrowLeft" ||
        key === "a" ||
        key === "ArrowRight" ||
        key === "d"
      ) {
        event.preventDefault();
        steer(0);
      }
    },
    [control, steer],
  );

  return (
    <div className="arcade-surface w-full">
      <button
        type="button"
        aria-label={label}
        className="arcade-surface block w-full touch-none rounded-control border border-border bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        style={{ aspectRatio: `${width} / ${height}` }}
        // iOS treats a held finger as the start of a text selection: the
        // callout menu appears, the magnifier pops up, and the page around
        // the stage highlights — on a game whose entire control scheme is
        // holding a finger down. `arcade-surface` turns the selection
        // gestures off; this stops the right-click/long-press menu that
        // rides along with them.
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          // The canvas takes focus on the first tap so the keyboard works
          // straight afterwards without a second, invisible interaction.
          event.currentTarget.focus();
          event.preventDefault();
          if (onDirection) {
            from.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          } else if (onSteer) {
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
        onPointerUp={(event) => {
          held.current = false;
          if (onDirection) {
            const start = from.current;
            from.current = null;
            const dx = start ? event.clientX - start.x : 0;
            const dy = start ? event.clientY - start.y : 0;
            if (Math.abs(dx) >= SWIPE_PX || Math.abs(dy) >= SWIPE_PX) {
              onDirection(
                Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 4 : 2) : dy < 0 ? 1 : 3,
              );
            } else {
              // Barely moved: treat it as a stab at a quarter of the stage.
              onDirection(
                quarterOf(event.currentTarget, event.clientX, event.clientY),
              );
            }
            return;
          }
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
