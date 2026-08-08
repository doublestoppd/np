"use client";

import {
  BIRD_HALF_H,
  BIRD_HALF_W,
  BIRD_X,
  FIELD_H,
  gapCentreAt,
  gapHeightAt,
  gateXAt,
  paperBirdSim,
  WALL_HALF_W,
  type PaperBirdState,
} from "@/lib/games/arcade/paper-bird";
import { UNIT } from "@/lib/games/arcade/core";
import { ArcadeGame } from "./arcade-game";
import { birdPalette } from "./palette";

/**
 * The Paper Bird (ADR-62): the drawing half.
 *
 * The physics live in `lib/games/arcade/paper-bird.ts` and are shared with
 * the server, so nothing in this file can change what a run scores.
 *
 * **The bird is drawn from the same constants it collides with.** It used
 * to be drawn at hardcoded pixel sizes with no relation to its hitbox, and
 * the hitbox was 64% taller than the picture — so it clipped walls it
 * visibly cleared, which is the single most infuriating thing an action
 * game can do. Everything here goes through `toPx`.
 */

/** Logical stage, in CSS pixels. Portrait, because a phone is. */
const W = 360;
const H = 460;

/** World units to stage pixels. The field is FIELD_H tall. */
const SCALE = H / (FIELD_H / UNIT);

function toPx(worldUnits: number): number {
  return (worldUnits / UNIT) * SCALE;
}

function draw(
  ctx: CanvasRenderingContext2D,
  state: PaperBirdState,
  phase: string,
) {
  const c = birdPalette();
  ctx.clearRect(0, 0, W, H);

  // Sky: cool at the top of the fell, warm toward the valley floor.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, c.skyHigh);
  sky.addColorStop(1, c.skyLow);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const cameraX = state.x;

  // Far hills, parallaxed at a third of the scroll so there is depth to
  // fall through rather than a flat backdrop.
  ctx.fillStyle = c.far;
  ctx.globalAlpha = 0.55;
  const drift = (toPx(cameraX) / 3) % 240;
  ctx.beginPath();
  ctx.moveTo(-drift, H);
  for (let i = 0; i <= 4; i += 1) {
    const x = -drift + i * 120;
    ctx.lineTo(x, H * 0.62 - (i % 2 === 0 ? 26 : 6));
    ctx.lineTo(x + 60, H * 0.62 + (i % 2 === 0 ? 10 : 24));
  }
  ctx.lineTo(W + 240, H);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // The walls. Only the ones that could be on screen — a gate's position
  // is a closed form of its index, so this never walks the course.
  const first = Math.max(0, state.passed - 1);
  for (let index = first; index < first + 6; index += 1) {
    const gateX = gateXAt(index);
    const screenX = toPx(gateX - cameraX);
    const wallW = toPx(WALL_HALF_W * 2);
    if (screenX < -wallW || screenX > W + wallW) continue;

    const centre = gapCentreAt(state.seed, index);
    const half = gapHeightAt(index) / 2;
    const gapTop = toPx(centre - half);
    const gapBottom = toPx(centre + half);
    const left = screenX - wallW / 2;

    for (const [y, height] of [
      [0, gapTop],
      [gapBottom, H - gapBottom],
    ] as const) {
      if (height <= 0) continue;
      // Lit on the left, shaded on the right, so a wall has a side to it.
      const face = ctx.createLinearGradient(left, 0, left + wallW, 0);
      face.addColorStop(0, c.wallLit);
      face.addColorStop(0.55, c.wall);
      face.addColorStop(1, c.wallShade);
      ctx.fillStyle = face;
      ctx.fillRect(left, y, wallW, height);

      // Drystone courses, so it reads as a wall and not a bar.
      ctx.strokeStyle = c.wallShade;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      for (let line = y + 8; line < y + height; line += 10) {
        ctx.beginPath();
        ctx.moveTo(left, line);
        ctx.lineTo(left + wallW, line);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Coping stones on each lip: the target picked out in the one colour
    // that is not in the wall, because this is the thing to aim at.
    ctx.fillStyle = c.wallLit;
    ctx.fillRect(left - 2, gapTop - 4, wallW + 4, 4);
    ctx.fillRect(left - 2, gapBottom, wallW + 4, 4);
    ctx.strokeStyle = c.wallShade;
    ctx.lineWidth = 1;
    ctx.strokeRect(left - 2, gapTop - 4, wallW + 4, 4);
    ctx.strokeRect(left - 2, gapBottom, wallW + 4, 4);
  }

  // The bird, at exactly the size it collides at. Rotation is presentation
  // only and never reaches the simulation.
  const bx = toPx(BIRD_X);
  const by = toPx(state.y);
  const halfW = toPx(BIRD_HALF_W);
  const halfH = toPx(BIRD_HALF_H);
  const tilt = Math.max(-0.5, Math.min(0.9, state.vy / 2600));
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(tilt);
  ctx.fillStyle = state.dead ? c.danger : c.bird;
  ctx.beginPath();
  ctx.moveTo(-halfW, -halfH);
  ctx.lineTo(halfW, 0);
  ctx.lineTo(-halfW, halfH);
  ctx.lineTo(-halfW * 0.45, 0);
  ctx.closePath();
  ctx.fill();
  // The fold, so it reads as folded paper rather than as an arrow.
  ctx.strokeStyle = c.birdFold;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-halfW * 0.7, -halfH * 0.5);
  ctx.lineTo(halfW * 0.45, 0);
  ctx.stroke();
  ctx.restore();

  if (phase === "PLAYING" && state.waiting) {
    ctx.fillStyle = c.ink;
    ctx.globalAlpha = 0.75;
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Tap to set off", W / 2, H / 2 + 70);
    ctx.globalAlpha = 1;
  }
}

export function PaperBirdGame(props: {
  claimsUsed: number;
  claimsPerDay: number;
  coinsToday: string;
  bestEver: number;
}) {
  return (
    <ArcadeGame<PaperBirdState>
      game="PAPER_BIRD"
      sim={paperBirdSim}
      width={W}
      height={H}
      draw={draw}
      unit={["wall", "walls"]}
      howTo="Tap to beat once. Everything else is gravity. The gaps narrow as you go, and it only ever ends one way — the question is how far down the fell you get first."
      {...props}
    />
  );
}
