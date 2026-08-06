/**
 * Shared class strings for radio/checkbox "card" choices (starter species,
 * featured companion). The input itself is visually hidden (`sr-only`),
 * so the card carries the checked and focus treatments via has-*.
 */
const CORE =
  "cursor-pointer rounded-surface border-2 border-border bg-surface transition-colors has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent";

/** Horizontal row card (art beside text). */
export const SELECTABLE_CARD_CLASSES = `flex items-center gap-3 p-3 ${CORE}`;

/** Stacked card (art above text) for grid pickers. */
export const SELECTABLE_CARD_COLUMN_CLASSES = `flex flex-col p-4 ${CORE}`;
