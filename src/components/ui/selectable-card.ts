/**
 * Shared class strings for radio/checkbox "card" choices (starter species,
 * featured companion). The input itself is visually hidden (`sr-only`),
 * so the card carries the checked and focus treatments via has-*.
 *
 * Selection is marked with a check glyph as well as the border and fill:
 * a hue shift alone left low-vision and colour-blind players with no
 * signal, even though the native radio kept screen readers correct. Pair a
 * card with SELECTED_MARK_CLASSES to render it.
 */
const CORE =
  "group relative cursor-pointer rounded-surface border-2 border-border bg-surface transition-colors has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent";

/**
 * The check mark itself: hidden until its card's input is checked. Render
 * it as the first child of a selectable card, with the glyph inside.
 */
export const SELECTED_MARK_CLASSES =
  "pointer-events-none absolute right-2 top-2 hidden size-5 items-center justify-center rounded-full bg-accent text-xs leading-none text-accent-contrast group-has-checked:flex";

/** Horizontal row card (art beside text). */
export const SELECTABLE_CARD_CLASSES = `flex items-center gap-3 p-3 ${CORE}`;

/** Stacked card (art above text) for grid pickers. */
export const SELECTABLE_CARD_COLUMN_CLASSES = `flex flex-col p-4 ${CORE}`;
