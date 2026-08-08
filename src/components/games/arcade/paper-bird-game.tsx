"use client";

import {
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
import { arcadePalette } from "./palette";

/**
 * The Paper Bird (ADR-62): the drawing half.
 *
 * Everything here is presentation. The physics live in
 * `lib/games/arcade/paper-bird.ts` and are shared with the server, so
 * nothing in this file can change what a run scores — which is exactly the
 * property that lets the drawing be as pretty or as rough as it likes
 * without anybody worrying about it.
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
  const c = arcadePalette();
  ctx.clearRect(0, 0, W, H);

  // Sky, and a horizon band so falling reads as falling rather than as
  // the field scrolling upward.
  ctx.fillStyle = c.sky;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = c.stoneEdge;
  ctx.lineWidth = 1;
  for (let band = 1; band < 4; band += 1) {
    const y = (H / 4) * band;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // The camera keeps the bird at a fixed x and slides the world past it.
  const cameraX = state.x;

  // Only the walls that could be on screen. Cheap because a gate's
  // position is a closed form of its index — see gateXAt.
  const first = Math.max(0, state.passed - 1);
  for (let index = first; index < first + 6; index += 1) {
    const gateX = gateXAt(index);
    const screenX = toPx(gateX - cameraX);
    if (screenX < -40 || screenX > W + 40) continue;

    const centre = gapCentreAt(state.seed, index);
    const half = gapHeightAt(index) / 2;
    const wallW = toPx(WALL_HALF_W * 2);
    const gapTop = toPx(centre - half);
    const gapBottom = toPx(centre + half);

    ctx.fillStyle = c.stone;
    ctx.fillRect(screenX - wallW / 2, 0, wallW, gapTop);
    ctx.fillRect(screenX - wallW / 2, gapBottom, wallW, H - gapBottom);

    // Drystone courses, so a wall reads as a wall and not a bar.
    ctx.strokeStyle = c.stoneEdge;
    ctx.lineWidth = 1;
    for (let y = 6; y < gapTop; y += 9) {
      ctx.beginPath();
      ctx.moveTo(screenX - wallW / 2, y);
      ctx.lineTo(screenX + wallW / 2, y);
      ctx.stroke();
    }
    for (let y = gapBottom + 6; y < H; y += 9) {
      ctx.beginPath();
      ctx.moveTo(screenX - wallW / 2, y);
      ctx.lineTo(screenX + wallW / 2, y);
      ctx.stroke();
    }
    // The lip of each gap, picked out so the target is legible at speed.
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screenX - wallW / 2, gapTop);
    ctx.lineTo(screenX + wallW / 2, gapTop);
    ctx.moveTo(screenX - wallW / 2, gapBottom);
    ctx.lineTo(screenX + wallW / 2, gapBottom);
    ctx.stroke();
  }

  // The bird: a folded triangle, tilted by how it is moving. Rotation is
  // presentation only and never touches the simulation.
  const bx = toPx(BIRD_X);
  const by = toPx(state.y);
  const tilt = Math.max(-0.5, Math.min(0.9, state.vy / 2600));
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(tilt);
  ctx.fillStyle = state.dead ? c.danger : c.ink;
  ctx.beginPath();
  ctx.moveTo(-9, -7);
  ctx.lineTo(11, 0);
  ctx.lineTo(-9, 7);
  ctx.lineTo(-5, 0);
  ctx.closePath();
  ctx.fill();
  // A folded wing, so it reads as paper rather than as an arrow.
  ctx.strokeStyle = c.sky;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-6, -4);
  ctx.lineTo(4, 0);
  ctx.stroke();
  ctx.restore();

  if (phase === "PLAYING" && state.waiting) {
    ctx.fillStyle = c.muted;
    ctx.font = "500 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Tap to set off", W / 2, H / 2 + 70);
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
