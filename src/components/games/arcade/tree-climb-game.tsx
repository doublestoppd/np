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
import type { PendingClaim } from "@/server/modules/games/arcade/run";
import { climbPalette } from "./palette";

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
  const c = climbPalette();
  ctx.clearRect(0, 0, W, H);

  // Deep green up in the canopy, lighter down toward the light. Inverted
  // from the bird's sky on purpose: one game is falling out of the open
  // air, the other is climbing into shade.
  ctx.fillStyle = c.canopyLow;
  ctx.fillRect(0, 0, W, H);

  // The camera trails the climber, so the climber sits low on screen and
  // most of the canvas is what is coming.
  const cameraY = Math.max(0, state.y - VIEW_H * 0.35);
  const toScreenY = (worldY: number) => H - toPx(worldY - cameraY);

  // The trunk behind everything, scrolling with the camera so there is
  // movement even between branches.
  //
  // Full width, because the climber wraps right round it — the play area
  // IS the trunk. Drawn at 44% it looked handsome and lied: branches at
  // the edges of the world floated in mid-air with nothing holding them
  // up, and the player could walk off the tree they were climbing.
  const trunkW = W;
  const trunkX = 0;
  const bark = ctx.createLinearGradient(trunkX, 0, trunkX + trunkW, 0);
  bark.addColorStop(0, c.bark);
  bark.addColorStop(0.35, c.barkLit);
  bark.addColorStop(1, c.bark);
  ctx.fillStyle = bark;
  ctx.fillRect(trunkX, 0, trunkW, H);

  ctx.strokeStyle = c.bark;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  const grain = toPx(cameraY) % 46;
  for (let i = 0; i < 5; i += 1) {
    const x = trunkX + ((i + 0.5) / 5) * trunkW;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  for (let y = -46 + grain; y < H + 46; y += 46) {
    ctx.beginPath();
    ctx.moveTo(trunkX + 4, y);
    ctx.bezierCurveTo(
      trunkX + trunkW * 0.4,
      y + 8,
      trunkX + trunkW * 0.6,
      y - 8,
      trunkX + trunkW - 4,
      y,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Deep shade in the canopy overhead, so up is somewhere darker and
  // there is a sense of climbing into the tree rather than along a plank.
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, c.canopyHigh);
  shade.addColorStop(0.55, "transparent");
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  // Only branches near the camera. Closed-form positions again, so this
  // never walks the tree from the bottom.
  const first = Math.max(0, state.reached - 3);
  for (let index = first; index < first + 22; index += 1) {
    const y = toScreenY(branchYAt(index));
    if (y < -20 || y > H + 20) continue;
    const half = branchHalfWidthAt(index);
    const cx = (branchXAt(state.seed, index) / FIELD_W) * W;
    const w = ((half * 2) / FIELD_W) * W;

    // Branches behind you are drawn spent, so the climb reads as a route
    // rather than as scenery.
    const behind = index < state.reached;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, y - 3, w, 6, 3);
    ctx.fillStyle = behind ? c.bark : c.barkLit;
    ctx.fill();
    // Outlined, because a branch is drawn in bark on a trunk drawn in
    // bark: without an edge the thing you are aiming at is the same
    // colour as the thing behind it.
    ctx.strokeStyle = c.canopyHigh;
    ctx.globalAlpha = behind ? 0.35 : 0.7;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (!behind) {
      // A few leaves on what is still ahead. Cheap, and it turns a row of
      // bars into a tree.
      ctx.fillStyle = c.leaf;
      for (const at of [-0.34, 0.12, 0.4]) {
        ctx.beginPath();
        ctx.ellipse(cx + w * at, y - 6, 5, 3, at, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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
  ctx.fillStyle = state.dead ? c.danger : c.climber;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-4, -8, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(4, -8, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // A face, so it is somebody rather than a dot.
  ctx.fillStyle = c.climberDark;
  ctx.beginPath();
  ctx.ellipse(-2.6, -1.5, 1.2, 1.4, 0, 0, Math.PI * 2);
  ctx.ellipse(2.6, -1.5, 1.2, 1.4, 0, 0, Math.PI * 2);
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
    ctx.fillStyle = c.climber;
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Hold a side to lean", W / 2, H / 2);
  }
}

export function TreeClimbGame(props: {
  claimsUsed: number;
  claimsPerDay: number;
  coinsToday: string;
  bestEver: number;
  pending: PendingClaim | null;
}) {
  return (
    <ArcadeGame<TreeClimbState>
      game="TREE_CLIMB"
      sim={treeClimbSim}
      width={W}
      height={H}
      draw={draw}
      control="lean"
      unit={["branch", "branches"]}
      howTo="It bounces on its own — you only steer. Hold the left or right half of the picture to lean that way and let go to slow down, or use the arrow keys. It carries its speed, so aim by letting go early. Branches get further apart and narrower the higher you go, and dropping below the dashed line ends it."
      {...props}
    />
  );
}
