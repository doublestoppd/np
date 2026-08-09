import type { ShrineTheme } from "@prisma/client";

/**
 * The Shrine's decoration (ADR-69). PURE — no database, no server.
 *
 * **This is the one place in the app that is deliberately, aggressively
 * ugly, and it is sandboxed on purpose.** Every value below is a CSS
 * custom property applied to a single wrapper element. The rest of the
 * game keeps its restrained palette and its design tokens; nothing here
 * leaks out, and nothing out there constrains what a player can do in
 * here. That separation is the whole trick — the app can hold a coherent
 * visual identity AND hand the player a can of spray paint.
 *
 * **No uploads, no HTML, no CSS from the player.** A page you can put
 * arbitrary markup on is the feature everybody remembers, and it is also
 * a stored-XSS hole with a moderation queue attached. So the decoration
 * is a set of CHOICES — theme, banner, stickers — and every piece of text
 * is rendered as text. A player can make something loud and personal and
 * unmistakably theirs without being able to run a script in a visitor's
 * session.
 *
 * Everything is CSS. No image assets, no fonts to download: the tiled
 * backgrounds are gradients and the typefaces are the web-safe stack that
 * shipped with the era.
 */

export interface ThemeSpec {
  /** What the player picks it by. */
  name: string;
  /** One line of flavour in the picker. */
  blurb: string;
  /** The tiled backdrop behind everything. */
  page: string;
  /**
   * The tile size for that backdrop.
   *
   * Needed because a `radial-gradient` without one paints exactly once
   * across the whole element — which turned a starfield into two dots and
   * a lagoon into two bubbles. Anything already repeating (the striped
   * and gingham themes use `repeating-linear-gradient`) leaves this
   * `auto` and tiles itself.
   */
  pageSize: string;
  /** Panels sitting on the backdrop. */
  panel: string;
  /** Body text. */
  ink: string;
  /** Headings, links, the loud bits. */
  glow: string;
  /** Borders and rules. */
  edge: string;
  /** Body typeface. */
  font: string;
  /** Heading typeface. */
  display: string;
}

/**
 * Exhaustive over the Prisma enum, so a theme added to the schema and not
 * given a look here is a compile error rather than an unstyled page.
 */
export const THEMES: Record<ShrineTheme, ThemeSpec> = {
  MIDNIGHT_WEB: {
    name: "Midnight Web",
    blurb: "Black sky, green text, and a lot of stars.",
    page: "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.85) 0 1.2px, transparent 1.6px), radial-gradient(circle at 70% 60%, rgba(255,255,255,0.55) 0 1px, transparent 1.4px), #05010f",
    pageSize: "54px 54px, 37px 37px, auto",
    panel: "rgba(12, 2, 34, 0.86)",
    ink: "#9dff7a",
    glow: "#ff3ce0",
    edge: "#4d6bff",
    font: "Verdana, Geneva, sans-serif",
    display: "Impact, 'Arial Black', Haettenschweiler, sans-serif",
  },
  BUBBLEGUM: {
    name: "Bubblegum",
    blurb: "Hot pink gingham. Unapologetic.",
    page: "repeating-linear-gradient(45deg, #ff8ec7 0 14px, #ffc3e1 14px 28px)",
    pageSize: "auto",
    panel: "#fff4fb",
    ink: "#46003c",
    glow: "#c4008f",
    edge: "#ff3fa4",
    font: "'Comic Sans MS', 'Trebuchet MS', cursive, sans-serif",
    display: "'Comic Sans MS', 'Trebuchet MS', cursive, sans-serif",
  },
  LAGOON: {
    name: "Lagoon",
    blurb: "Underwater, with bubbles that never move.",
    page: "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.45) 0 6px, transparent 7px), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 0 9px, transparent 10px), linear-gradient(180deg, #0aa5c4 0%, #04566b 100%)",
    pageSize: "90px 90px, 140px 140px, auto",
    panel: "#e9feff",
    ink: "#04303a",
    glow: "#00707f",
    edge: "#0aa5c4",
    font: "'Trebuchet MS', Tahoma, sans-serif",
    display: "'Trebuchet MS', Tahoma, sans-serif",
  },
  MARIGOLD: {
    name: "Marigold",
    blurb: "Every wallpaper in every kitchen, 1974.",
    page: "repeating-linear-gradient(90deg, #e2571e 0 22px, #f0912f 22px 44px, #f7c66b 44px 66px)",
    pageSize: "auto",
    panel: "#fff5df",
    ink: "#3a1d02",
    glow: "#a8320a",
    edge: "#a8320a",
    font: "Georgia, 'Times New Roman', serif",
    display: "Georgia, 'Times New Roman', serif",
  },
  VAPOUR: {
    name: "Vapour",
    blurb: "A grid receding towards a sun you cannot see.",
    page: "repeating-linear-gradient(0deg, rgba(0,240,255,0.28) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, rgba(0,240,255,0.28) 0 1px, transparent 1px 32px), linear-gradient(180deg, #2a004f 0%, #7b1b8f 60%, #ff5fa2 100%)",
    pageSize: "auto",
    panel: "rgba(28, 0, 52, 0.86)",
    ink: "#fbe9ff",
    glow: "#28f7ff",
    edge: "#ff5fa2",
    font: "'Trebuchet MS', Tahoma, sans-serif",
    display: "Impact, 'Arial Black', sans-serif",
  },
  PARCHMENT: {
    name: "Parchment",
    blurb: "For the serious business of pretending to be a wizard.",
    page: "repeating-linear-gradient(115deg, #d9c79a 0 3px, #cdb98a 3px 6px)",
    pageSize: "auto",
    panel: "#f8efd6",
    ink: "#3a2a12",
    glow: "#8b1a1a",
    edge: "#8a6f3c",
    font: "'Book Antiqua', Palatino, Georgia, serif",
    display: "'Book Antiqua', Palatino, Georgia, serif",
  },
  TERMINAL: {
    name: "Terminal",
    blurb: "Green on black, with the scanlines you remember.",
    page: "repeating-linear-gradient(0deg, rgba(0,255,102,0.09) 0 2px, transparent 2px 4px), #010601",
    pageSize: "auto",
    panel: "rgba(0, 18, 4, 0.9)",
    ink: "#4dff85",
    glow: "#b6ffcf",
    edge: "#1c8a3f",
    font: "'Courier New', Courier, monospace",
    display: "'Courier New', Courier, monospace",
  },
  COTTON_CANDY: {
    name: "Cotton Candy",
    blurb: "Soft, pastel, and faintly sticky.",
    page: "linear-gradient(135deg, #ffd9f0 0%, #d9ecff 50%, #e4d9ff 100%)",
    pageSize: "auto",
    panel: "#fffcff",
    ink: "#43305c",
    glow: "#d43f8d",
    edge: "#f0a6cd",
    font: "'Trebuchet MS', Verdana, sans-serif",
    display: "'Trebuchet MS', Verdana, sans-serif",
  },
};

/** The picker's order. Keyed off the record, so it can never fall behind. */
export function themeList(): { key: ShrineTheme; spec: ThemeSpec }[] {
  return (Object.keys(THEMES) as ShrineTheme[]).map((key) => ({
    key,
    spec: THEMES[key],
  }));
}

/** The custom properties a theme sets on the shrine's wrapper. */
export function themeStyle(theme: ShrineTheme): Record<string, string> {
  const spec = THEMES[theme];
  return {
    "--shrine-page": spec.page,
    "--shrine-page-size": spec.pageSize,
    "--shrine-panel": spec.panel,
    "--shrine-ink": spec.ink,
    "--shrine-glow": spec.glow,
    "--shrine-edge": spec.edge,
    "--shrine-font": spec.font,
    "--shrine-display": spec.display,
  };
}

/**
 * The sticker wall.
 *
 * Every one of these is a CSS plaque with an emoji on it — not an image,
 * and deliberately not a reproduction of any real badge from the era.
 * Those were somebody's artwork and several were trademarks; these are the
 * same joke told in our own words.
 */
export interface Sticker {
  key: string;
  face: string;
  label: string;
}

export const STICKERS: readonly Sticker[] = [
  { key: "construction", face: "🚧", label: "Under construction" },
  { key: "resolution", face: "🖥️", label: "Best viewed at 800×600" },
  { key: "handmade", face: "✋", label: "100% hand-made" },
  { key: "sign", face: "✍️", label: "Sign the guestbook!" },
  { key: "ring", face: "💍", label: "Part of the ring" },
  { key: "cocoa", face: "☕", label: "Powered by cocoa" },
  { key: "moon", face: "🌙", label: "Nocturnal" },
  { key: "adopted", face: "🥚", label: "Adopt one!" },
  { key: "nojs", face: "🧾", label: "No script required" },
  { key: "email", face: "📬", label: "Mail the keeper" },
  { key: "award", face: "🏅", label: "Self-awarded" },
  { key: "cat", face: "🐈", label: "Cat approved" },
] as const;

/** How many stickers fit on one wall. Enough to be silly, not endless. */
export const STICKER_LIMIT = 6;

const BY_KEY = new Map(STICKERS.map((sticker) => [sticker.key, sticker]));

export function stickerFor(key: string): Sticker | null {
  return BY_KEY.get(key) ?? null;
}

/**
 * Stored as one string because it is a short, ordered, deduplicated list
 * of keys from a fixed catalogue — a join table for at most six decorative
 * badges would be three queries to draw a row of stickers.
 */
export function parseStickers(stored: string): Sticker[] {
  const seen = new Set<string>();
  const chosen: Sticker[] = [];
  for (const key of stored.split(",")) {
    const sticker = stickerFor(key.trim());
    if (!sticker || seen.has(sticker.key)) continue;
    seen.add(sticker.key);
    chosen.push(sticker);
    if (chosen.length === STICKER_LIMIT) break;
  }
  return chosen;
}

/** The inverse, and the only thing that may be written to the column. */
export function serializeStickers(keys: readonly string[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const key of keys) {
    const sticker = stickerFor(key);
    if (!sticker || seen.has(sticker.key)) continue;
    seen.add(sticker.key);
    kept.push(sticker.key);
    if (kept.length === STICKER_LIMIT) break;
  }
  return kept.join(",");
}

/**
 * The counter's digits, zero-padded the way every one of them was.
 *
 * Six digits, because "000001" is funnier than "1" and because a counter
 * that has visibly not rolled over is part of the joke.
 */
export const COUNTER_DIGITS = 6;

export function counterDigits(visits: number): string[] {
  const clamped = Math.max(0, Math.min(visits, 10 ** COUNTER_DIGITS - 1));
  return String(clamped).padStart(COUNTER_DIGITS, "0").split("");
}
