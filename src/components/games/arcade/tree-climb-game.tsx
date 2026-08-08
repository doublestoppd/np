"use client";

import {
  branchHalfWidthAt,
  branchXAt,
  branchYAt,
  FIELD_W,
  treeClimbSim,
  VIEW_H,
  type TreeClimbState,
} from "@/lib/games/arcade/tree-climb";
import { UNIT } from "@/lib/games/arcade/core";
import { ArcadeGame } from "./arcade-game";
import { arcadePalette } from "./palette";

/**
 * The Long Way Up (ADR-62): the drawing half.
 *
 * Note the axis flip. The simulation measures height UPWARD from the foot
 * of the tree; a canvas measures downward from the top. Every y here goes
 * through `toScreenY`, which is the single place the two conventions meet
 * — doing it inline was how the simulation itself ended up with mixed
 * axes in its first draft.
 */

const W = 360;
const H = 460;

/** World units to pixels. The visible column is VIEW_H tall. */
const SCALE = H / (VIEW_H / UNIT);

function toPx(worldUnits: number): number {
  return (worldUnits / UNIT) * SCALE;
}

function draw(
  ctx: CanvasRenderingContext2D,
  state: TreeClimbState,
  phase: string,
) {
  const c = arcadePalette();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = c.sky;
  ctx.fillRect(0, 0, W, H);

  // The camera trails the climber, so the climber sits low on screen and
  // most of the canvas is what is coming.
  const cameraY = Math.max(0, state.y - VIEW_H * 0.35);
  const toScreenY = (worldY: number) => H - toPx(worldY - cameraY);

  // The trunk, drawn behind everything and scrolling with the camera so
  // there is some sense of movement even between branches.
  ctx.strokeStyle = c.stoneEdge;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 5; i += 1) {
    const x = ((i + 0.5) / 5) * W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  const grainOffset = toPx(cameraY) % 40;
  for (let y = -40 + grainOffset; y < H + 40; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Only branches near the camera. Closed-form positions again, so this
  // never walks the tree from the bottom.
  const first = Math.max(0, state.reached - 3);
  for (let index = first; index < first + 22; index += 1) {
    const y = toScreenY(branchYAt(index));
    if (y < -20 || y > H + 20) continue;
    const half = branchHalfWidthAt(index);
    const cx = (branchXAt(state.seed, index) / FIELD_W) * W;
    const w = (half * 2 / FIELD_W) * W;

    ctx.fillStyle = index <= state.reached ? c.stoneEdge : c.stone;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, y - 3, w, 6, 3);
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // The climber, tilted by its SPEED rather than by the key being held.
  // Momentum is the thing a player has to learn here, so it has to be
  // visible: still leaning after you let go is the whole lesson.
  const cx = (state.x / FIELD_W) * W;
  const cy = toScreenY(state.y);
  const tilt = Math.max(-0.4, Math.min(0.4, state.vx / 3200));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.fillStyle = state.dead ? c.danger : c.accent;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-4, -8, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(4, -8, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The drop. Nothing below this line is survivable, so it is drawn.
  const floorY = toScreenY(state.floor);
  if (floorY < H + 20 && state.floor > 0) {
    ctx.strokeStyle = c.danger;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(0, floorY);
    ctx.lineTo(W, floorY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  if (phase === "PLAYING" && state.waiting) {
    ctx.fillStyle = c.muted;
    ctx.font = "500 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Hold a side to lean", W / 2, H / 2);
  }
}

export function TreeClimbGame(props: {
  claimsUsed: number;
  claimsPerDay: number;
  coinsToday: string;
  bestEver: number;
}) {
  return (
    <ArcadeGame<TreeClimbState>
      game="TREE_CLIMB"
      sim={treeClimbSim}
      width={W}
      height={H}
      draw={draw}
      steers
      unit={["branch", "branches"]}
      howTo="It bounces on its own — you only steer. Hold the left or right half of the picture to lean that way and let go to slow down, or use the arrow keys. It carries its speed, so aim by letting go early. Branches get further apart and narrower the higher you go, and dropping below the dashed line ends it."
      {...props}
    />
  );
}
