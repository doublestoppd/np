"use client";

import { useEffect, useRef } from "react";
import type { ShrineEffect } from "@prisma/client";

/**
 * The falling things, and the thing that follows your cursor (ADR-70).
 *
 * **Sandboxed to the shrine's own box, not the window.** Every page of the
 * era pinned these to the viewport, which is why a cursor trail followed
 * you into the checkout. This canvas is absolutely positioned inside the
 * shrine's wrapper, so the snow falls past somebody's page and stops at
 * the edge of it — the joke, without the app-wide hijack.
 *
 * `pointer-events: none` throughout: a decoration that eats clicks is a
 * broken page, and the guestbook sits underneath this.
 *
 * Under `prefers-reduced-motion` it renders nothing at all. Falling
 * particles and a cursor trail are exactly what that preference is for,
 * and a "reduced" version of them would still be the thing being asked
 * about.
 */

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  spin: number;
}

interface EffectSpec {
  /** How many drift down on their own. */
  falling: number;
  /** How many are thrown off the pointer per move. */
  trail: number;
  colour: string;
  /** Downward speed, in pixels a second. Negative rises. */
  drift: number;
  shape: "dot" | "flake" | "leaf";
  size: [number, number];
}

const SPECS: Record<Exclude<ShrineEffect, "NONE">, EffectSpec> = {
  SPARKLES: {
    falling: 0,
    trail: 3,
    colour: "255, 236, 140",
    drift: 40,
    shape: "dot",
    size: [1.5, 3.5],
  },
  SNOW: {
    falling: 60,
    trail: 1,
    colour: "255, 255, 255",
    drift: 34,
    shape: "flake",
    size: [1.5, 3.5],
  },
  LEAVES: {
    falling: 26,
    trail: 0,
    colour: "214, 138, 58",
    drift: 42,
    shape: "leaf",
    size: [3, 6],
  },
  BUBBLES: {
    falling: 34,
    trail: 1,
    colour: "215, 245, 255",
    drift: -30,
    shape: "dot",
    size: [2, 6],
  },
  EMBERS: {
    falling: 30,
    trail: 2,
    colour: "255, 148, 62",
    drift: -46,
    shape: "dot",
    size: [1, 3],
  },
};

export function PageEffects({ effect }: { effect: ShrineEffect }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (effect === "NONE") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const element = canvas.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    const context = element.getContext("2d");
    if (!context) return;

    const spec = SPECS[effect];
    let width = 0;
    let height = 0;
    const motes: Mote[] = [];
    let frame = 0;
    let last = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = parent.clientWidth;
      height = parent.clientHeight;
      element.width = Math.floor(width * ratio);
      element.height = Math.floor(height * ratio);
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const seed = (x?: number, y?: number): Mote => {
      const [low, high] = spec.size;
      return {
        x: x ?? Math.random() * width,
        y: y ?? (spec.drift > 0 ? Math.random() * height : height),
        vx: (Math.random() - 0.5) * 22,
        vy: spec.drift * (0.6 + Math.random() * 0.8),
        size: low + Math.random() * (high - low),
        life: 1,
        spin: Math.random() * Math.PI,
      };
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    for (let index = 0; index < spec.falling; index += 1) motes.push(seed());

    const onPointer = (event: PointerEvent) => {
      if (spec.trail === 0) return;
      const box = parent.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      if (x < 0 || y < 0 || x > width || y > height) return;
      for (let index = 0; index < spec.trail; index += 1) {
        const mote = seed(x, y);
        // Thrown, not dropped: a trail that only falls looks like a leak.
        mote.vx = (Math.random() - 0.5) * 70;
        mote.vy = (Math.random() - 0.5) * 70;
        mote.life = 0.9;
        motes.push(mote);
      }
      // A pointer held still would otherwise grow the array forever.
      if (motes.length > spec.falling + 160) {
        motes.splice(0, motes.length - (spec.falling + 160));
      }
    };
    parent.addEventListener("pointermove", onPointer);

    const draw = (now: number) => {
      const delta = last === 0 ? 0.016 : Math.min((now - last) / 1000, 0.05);
      last = now;
      context.clearRect(0, 0, width, height);

      for (let index = motes.length - 1; index >= 0; index -= 1) {
        const mote = motes[index] as Mote;
        mote.x += mote.vx * delta;
        mote.y += mote.vy * delta;
        mote.spin += delta * 2;
        // Trail motes fade; the steady fall does not, it just wraps.
        if (mote.life < 1) {
          mote.life -= delta * 1.4;
          if (mote.life <= 0) {
            motes.splice(index, 1);
            continue;
          }
        } else if (spec.drift > 0 ? mote.y > height + 8 : mote.y < -8) {
          Object.assign(mote, seed(undefined, spec.drift > 0 ? -8 : height + 8));
          continue;
        }

        context.globalAlpha = Math.max(0, Math.min(1, mote.life)) * 0.85;
        context.fillStyle = `rgb(${spec.colour})`;
        if (spec.shape === "leaf") {
          context.save();
          context.translate(mote.x, mote.y);
          context.rotate(mote.spin);
          context.beginPath();
          context.ellipse(0, 0, mote.size, mote.size * 0.45, 0, 0, Math.PI * 2);
          context.fill();
          context.restore();
        } else if (spec.shape === "flake") {
          context.fillRect(mote.x, mote.y, mote.size, mote.size);
        } else {
          context.beginPath();
          context.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalAlpha = 1;
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      parent.removeEventListener("pointermove", onPointer);
    };
  }, [effect]);

  if (effect === "NONE") return null;
  return <canvas ref={canvas} className="shrine-effects" aria-hidden="true" />;
}
