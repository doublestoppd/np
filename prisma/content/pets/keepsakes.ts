import type { KeepsakeContent } from "../schemas";

/**
 * What a companion did to come by the thing (ADR-61).
 *
 * The sentence matters more than the object. "A Particular Pebble" in a
 * satchel is a pebble; "A Particular Pebble, carried in from somewhere and
 * set down in front of you with enormous ceremony" is a small story, and
 * the story is the entire reward — the pebble is worth two coins.
 *
 * Written in the third person about the companion, present tense, and
 * never about the player's feelings. The game says what happened; how to
 * feel about it is not its business.
 *
 * Weights are relative and deliberately flat. A rarer keepsake would make
 * this a table to farm, and there is nothing here worth farming.
 */
export const keepsakes = [
  {
    itemSlug: "one-good-feather",
    weight: 120,
    line: "Carried in sideways, because it does not fit any other way, and set down where you would trip over it.",
  },
  {
    itemSlug: "a-particular-pebble",
    weight: 160,
    line: "Brought in from somewhere and put down in front of you with enormous ceremony. It is a pebble. It is, apparently, the pebble.",
  },
  {
    itemSlug: "somebodys-button",
    weight: 110,
    line: "Found under something, prised out with great difficulty, and guarded for most of an afternoon before being handed over.",
  },
  {
    itemSlug: "a-length-of-good-string",
    weight: 140,
    line: "Fought for. Won. Rewon twice more on the way back, against nobody.",
  },
  {
    itemSlug: "the-smoothest-acorn",
    weight: 130,
    line: "Chosen out of a great many, which took a while, and then carried the whole way home without once being chewed.",
  },
  {
    itemSlug: "a-scrap-of-blue",
    weight: 100,
    line: "Dragged in from the hedge and arranged, with some care, in the middle of the floor where it shows up best.",
  },
  {
    itemSlug: "an-interesting-snail-shell",
    weight: 110,
    line: "Investigated at length first, to be sure nobody was home, and only then brought to you.",
  },
  {
    itemSlug: "a-perfectly-flat-stone",
    weight: 90,
    line: "Held on to for two days before it was offered, which suggests the decision was not an easy one.",
  },
] as const satisfies readonly KeepsakeContent[];
