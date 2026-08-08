/**
 * The colours the canvases draw in (ADR-62).
 *
 * Read out of the stylesheet rather than hardcoded, so a canvas is not the
 * one surface in the game that ignores the design tokens — and so that a
 * palette change lands here too instead of leaving two games looking like
 * they belong to an older version of the app (docs/art-direction.md:
 * replaceable design tokens).
 *
 * Read once per draw call is far too often, so this caches; a token change
 * at runtime is not a thing that happens outside a theme switch, and the
 * cache is keyed so a switch would still be picked up.
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

export interface ArcadePalette {
  sky: string;
  ink: string;
  muted: string;
  stone: string;
  stoneEdge: string;
  accent: string;
  danger: string;
}

export function arcadePalette(): ArcadePalette {
  return {
    sky: token("--color-surface-sunken", "#e8dcc3"),
    ink: token("--color-text", "#2b2418"),
    muted: token("--color-text-muted", "#6b5f49"),
    stone: token("--color-border-strong", "#bcaa88"),
    stoneEdge: token("--color-border", "#ded0b3"),
    accent: token("--color-accent", "#35664a"),
    danger: token("--color-danger", "#a03a2e"),
  };
}

/** Clears the cache. Called when the theme changes. */
export function forgetPalette(): void {
  cache.clear();
}
