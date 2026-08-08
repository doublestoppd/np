/**
 * The colours the canvases draw in (ADR-62).
 *
 * Read out of the stylesheet rather than hardcoded, so a canvas is not the
 * one surface in the game that ignores the design tokens — and so that a
 * palette change lands here too instead of leaving two games looking like
 * they belong to an older version of the app (docs/art-direction.md:
 * replaceable design tokens).
 *
 * The first version borrowed the SURFACE tokens — background, border, text
 * — which are all beige, so both stages came out the same parchment as the
 * page around them and read as panels rather than pictures. There is now
 * an `--color-arcade-*` family for exactly this, defined beside the rest of
 * the palette in globals.css.
 *
 * Reading computed styles once per frame is far too often, so this caches.
 */
const cache = new Map<string, string>();

export function token(name: string, fallback: string): string {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const resolved = value.length > 0 ? value : fallback;
  cache.set(name, resolved);
  return resolved;
}

export interface BirdPalette {
  skyHigh: string;
  skyLow: string;
  far: string;
  wall: string;
  wallLit: string;
  wallShade: string;
  bird: string;
  birdFold: string;
  ink: string;
  muted: string;
  danger: string;
}

export function birdPalette(): BirdPalette {
  return {
    skyHigh: token("--color-arcade-sky-high", "#b9d4dd"),
    skyLow: token("--color-arcade-sky-low", "#e6dcc0"),
    far: token("--color-arcade-far", "#93b09b"),
    wall: token("--color-arcade-wall", "#6f7f5c"),
    wallLit: token("--color-arcade-wall-lit", "#8b9a74"),
    wallShade: token("--color-arcade-wall-shade", "#4e5b40"),
    bird: token("--color-arcade-bird", "#c96a2e"),
    birdFold: token("--color-arcade-bird-fold", "#f2e3c8"),
    ink: token("--color-text", "#2b2418"),
    muted: token("--color-text-muted", "#6b5f49"),
    danger: token("--color-danger", "#a03a2e"),
  };
}

export interface ClimbPalette {
  canopyHigh: string;
  canopyLow: string;
  bark: string;
  barkLit: string;
  leaf: string;
  climber: string;
  climberDark: string;
  ink: string;
  muted: string;
  danger: string;
}

export function climbPalette(): ClimbPalette {
  return {
    canopyHigh: token("--color-arcade-canopy-high", "#274734"),
    canopyLow: token("--color-arcade-canopy-low", "#4e7350"),
    bark: token("--color-arcade-bark", "#6b4b33"),
    barkLit: token("--color-arcade-bark-lit", "#8a6647"),
    leaf: token("--color-arcade-leaf", "#5c8a4a"),
    climber: token("--color-arcade-climber", "#d8a53f"),
    climberDark: token("--color-arcade-climber-dark", "#8f6415"),
    ink: token("--color-text", "#2b2418"),
    muted: token("--color-text-muted", "#6b5f49"),
    danger: token("--color-danger", "#a03a2e"),
  };
}

/** Clears the cache. Called when the theme changes. */
export function forgetPalette(): void {
  cache.clear();
}

export interface SnakePalette {
  grass: string;
  grassDark: string;
  snake: string;
  head: string;
  apple: string;
  ink: string;
  danger: string;
}

export function snakePalette(): SnakePalette {
  return {
    grass: token("--color-arcade-grass", "#6f8f4a"),
    grassDark: token("--color-arcade-grass-dark", "#5a7a3c"),
    snake: token("--color-arcade-snake", "#2f5d3a"),
    head: token("--color-arcade-snake-head", "#23472c"),
    apple: token("--color-arcade-apple", "#b83f36"),
    ink: token("--color-text", "#2b2418"),
    danger: token("--color-danger", "#a03a2e"),
  };
}
