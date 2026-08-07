import type { HollowAirContent } from "../schemas";

/**
 * Airs: the light a ground is seen in.
 *
 * An air is the one purchase in the game that makes things you already own
 * worth more. It is account-wide and free to switch, so four grounds and
 * four airs are sixteen readings of the same furnishings — and the
 * hundredth object you buy will be seen under every air you have, and
 * every air you ever buy afterwards. That is the whole reason a Hollow
 * does not die at purchase six.
 *
 * The first is free, because a ground with no light is not a picture.
 */
export const hollowAirs = [
  {
    key: "open-day",
    name: "Open Day",
    description:
      "Ordinary daylight, generous and uncomplicated. Everything looks like itself.",
    price: 0n,
    sortOrder: 0,
  },
  {
    key: "first-thaw",
    name: "First Thaw",
    description:
      "Thin cold light with the winter going out of it. Edges are sharp and every colour is honest about being slightly too pale.",
    price: 5_000n,
    sortOrder: 1,
  },
  {
    key: "low-gold",
    name: "Low Gold",
    description:
      "The hour before evening, when everything you own looks like you placed it on purpose.",
    price: 12_000n,
    sortOrder: 2,
  },
  {
    key: "soft-rain",
    name: "Soft Rain",
    description:
      "Grey, close, and quiet. Anything that holds a light holds it twice — once in the air and once in the wet.",
    price: 30_000n,
    sortOrder: 3,
  },
] satisfies readonly HollowAirContent[];
