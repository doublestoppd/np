import type { RandomEventDefinition } from "../types";

/**
 * Things found by looking down. The backbone of the catalog: frequent,
 * small, and never worth farming for — the coin ranges are below the price
 * of a single shop snack, so an event is a pleasant nudge rather than an
 * income stream.
 */
export const discoveryEvents: RandomEventDefinition[] = [
  {
    key: "loose-change-in-the-moss",
    title: "Loose change",
    message:
      "Something glints in the moss by your boot. Three coins, a bottle cap, and a very startled beetle. You take the coins.",
    weight: 900,
    enabled: true,
    category: "discovery",
    rarity: "common",
    effects: [{ kind: "coins", min: 3, max: 9 }],
  },
  {
    key: "honest-mistake-refund",
    title: "An honest mistake",
    message:
      "A stallholder catches up with you, out of breath, holding out a handful of coins. “Short-changed you,” they say, and refuse to discuss it further.",
    weight: 700,
    enabled: true,
    category: "discovery",
    rarity: "common",
    effects: [{ kind: "coins", min: 5, max: 14 }],
  },
  {
    key: "pocket-inventory",
    title: "Pocket inventory",
    message:
      "You check your pockets for no particular reason and find coins you have no memory of putting there. This keeps happening.",
    weight: 800,
    enabled: true,
    category: "discovery",
    rarity: "common",
    effects: [{ kind: "coins", min: 2, max: 6 }],
  },
  {
    key: "market-day-tip",
    title: "Finder's fee",
    message:
      "You point a lost customer toward the right stall. They insist on paying you for it. You insist back, briefly, and then accept.",
    weight: 500,
    enabled: true,
    category: "discovery",
    rarity: "common",
    eligibility: { routePrefixes: ["/market", "/shops", "/shop"] },
    effects: [{ kind: "coins", min: 8, max: 20 }],
  },
  {
    key: "acorn-underfoot",
    title: "An acorn, underfoot",
    message:
      "You step on something. It is an acorn. It is, on inspection, an extremely ordinary acorn. You keep it anyway.",
    weight: 900,
    enabled: true,
    category: "discovery",
    rarity: "common",
    effects: [{ kind: "item", slug: "unremarkable-acorn", quantity: 1 }],
  },
  {
    key: "riverbank-glint",
    title: "Riverbank glint",
    message:
      "A pebble in the shallows is a colour pebbles are not usually. You fish it out before you can talk yourself out of it.",
    weight: 700,
    enabled: true,
    category: "discovery",
    rarity: "common",
    effects: [{ kind: "item", slug: "painted-river-pebble", quantity: 1 }],
  },
  {
    key: "someone-dropped-this",
    title: "Someone dropped this",
    message:
      "A brass button, green at the edges, sitting in the path exactly where a button would be least likely to survive. You pick it up. Nobody claims it.",
    weight: 600,
    enabled: true,
    category: "discovery",
    rarity: "common",
    effects: [{ kind: "item", slug: "mossy-brass-button", quantity: 1 }],
  },
  {
    key: "pressed-between-pages",
    title: "Pressed between pages",
    message:
      "A fern frond falls out of a book you were not reading. It is flat, perfect, and clearly older than the book.",
    weight: 400,
    enabled: true,
    category: "discovery",
    rarity: "common",
    eligibility: {
      routePrefixes: ["/explore/dapplewood/whisperleaf-reading-room"],
    },
    effects: [{ kind: "item", slug: "pressed-fern-frond", quantity: 1 }],
  },
];
