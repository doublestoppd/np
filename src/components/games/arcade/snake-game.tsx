"use client";

import {
  COLS,
  ROWS,
  snakeSim,
  type SnakeState,
} from "@/lib/games/arcade/snake";
import { ArcadeGame } from "./arcade-game";
import { snakePalette } from "./palette";

/**
 * The Long Grass (ADR-62): the drawing half.
 *
 * A grid, so everything here is a cell index times CELL. The plot is drawn
 * at exactly the size the simulation uses — there is no separate idea of
 * how big anything is, which is the arrangement The Paper Bird had to be
 * corrected into.
 */

const CELL = 30;
const W = COLS * CELL;
const H = ROWS * CELL;

function draw(
  ctx: CanvasRenderingContext2D,
  state: SnakeState,
  phase: string,
) {
  const c = snakePalette();
  ctx.clearRect(0, 0, W, H);

  // The plot, in two shades so the grid reads without drawing a grid.
  ctx.fillStyle = c.grass;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.grassDark;
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = (y % 2 === 0 ? 0 : 1); x < COLS; x += 2) {
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }

  // Tufts, fixed to the plot rather than to the snake, so the grass looks
  // like grass and nothing about it moves to distract from what does.
  ctx.strokeStyle = c.grass;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  for (let y = 0; y < ROWS; y += 3) {
    for (let x = (y % 6 === 0 ? 1 : 4); x < COLS; x += 5) {
      const px = x * CELL + CELL / 2;
      const py = y * CELL + CELL / 2;
      ctx.beginPath();
      ctx.moveTo(px - 5, py + 5);
      ctx.quadraticCurveTo(px - 2, py - 3, px + 1, py - 6);
      ctx.moveTo(px + 5, py + 5);
      ctx.quadraticCurveTo(px + 3, py - 2, px + 6, py - 5);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // The apple.
  const ax = state.apple.x * CELL + CELL / 2;
  const ay = state.apple.y * CELL + CELL / 2;
  ctx.fillStyle = c.apple;
  ctx.beginPath();
  ctx.arc(ax, ay, CELL * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = c.snake;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ax, ay - CELL * 0.28);
  ctx.lineTo(ax + 3, ay - CELL * 0.42);
  ctx.stroke();

  // The snake, tail first so the head draws over its own neck.
  for (let i = state.body.length - 1; i >= 0; i -= 1) {
    const cell = state.body[i] as { x: number; y: number };
    const head = i === 0;
    const inset = head ? 2 : 3.5;
    ctx.fillStyle = state.dead && head ? c.danger : head ? c.head : c.snake;
    ctx.beginPath();
    ctx.roundRect(
      cell.x * CELL + inset,
      cell.y * CELL + inset,
      CELL - inset * 2,
      CELL - inset * 2,
      head ? 8 : 6,
    );
    ctx.fill();
  }

  // Eyes on the head, looking the way it is going.
  const head = state.body[0] as { x: number; y: number };
  const hx = head.x * CELL + CELL / 2;
  const hy = head.y * CELL + CELL / 2;
  // Across the direction of travel, so they sit on the face rather than
  // stacked along the body.
  const ex = state.dy === 0 ? 0 : 4;
  const ey = state.dy === 0 ? 4 : 0;
  ctx.fillStyle = c.grass;
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(
      hx + state.dx * 4 + ex * sign,
      hy + state.dy * 4 + ey * sign,
      2.2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  if (phase === "PLAYING" && state.waiting) {
    ctx.fillStyle = c.ink;
    ctx.globalAlpha = 0.8;
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Swipe to set off", W / 2, H - 26);
    ctx.globalAlpha = 1;
  }
}

export function SnakeGame(props: {
  claimsUsed: number;
  claimsPerDay: number;
  coinsToday: string;
  bestEver: number;
}) {
  return (
    <ArcadeGame<SnakeState>
      game="SNAKE"
      sim={snakeSim}
      width={W}
      height={H}
      draw={draw}
      control="compass"
      unit={["apple", "apples"]}
      howTo="Swipe, or tap the side you want to turn towards — the arrow keys work too. It never stops crawling, and it gets quicker with every apple. The fence and your own tail are the only two things that can end it."
      {...props}
    />
  );
}
