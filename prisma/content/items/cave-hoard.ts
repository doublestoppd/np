import type { BookContent, ItemContent } from "../schemas";

/**
 * The hoard at the bottom of the Sunken Stair (ADR-59).
 *
 * Ten things that exist in exactly one place. No shop stocks them, no
 * spot yields them, no drum pays them out — the only way any of these
 * reaches a satchel is that somebody guessed right ten times in a row and
 * walked into the last room.
 *
 * Rules held while writing these, and they are the same three the relics
 * were written under:
 *
 * 1. **None of them make the game easier.** The food feeds and the toys
 *    amuse, at ordinary strengths for their price; the books are worth
 *    reading and no more. Nothing here is a permanent advantage, because
 *    the coins that pay for everything else are earned by playing and a
 *    rare thing that changed that would be pay-to-win with a longer walk.
 * 2. **Each one is an object with a history**, not a tier with a name.
 *    They read as things left behind by whoever used this cave before,
 *    which is the only story the cave tells.
 * 3. **No set, no series, no numbering.** Ten of them is a fact about the
 *    pool, not a checklist — nothing in the game will ever tell a player
 *    which ones they are missing (docs/profile-and-showcases.md).
 *
 * Deliberately a MIX of food, toys and books rather than ten curios.
 * Something you eat and something you read are gone afterwards, which
 * means the hoard can be reached twice and matter twice; a shelf of
 * untouchable trophies would make the second clear a duplicate.
 *
 * They are tradeable. A player who reaches the bottom and finds a thing
 * they have already got should be able to pass it on, and the market is
 * the only route by which anybody who is unlucky at doors will ever see
 * one of these at all.
 */
export const caveHoardItems = [
  // ---- Food -----------------------------------------------------------
  {
    slug: "stairwell-honeycomb",
    name: "Stairwell Honeycomb",
    description:
      "Wild comb built in a crack of the stair by bees that had no business being down there. Dark, cold, and startlingly good.",
    type: "FOOD",
    category: "food",
    tags: ["sweet", "foraged"],
    price: 900n,
    rarity: "ULTRA_RARE",
    artKey: "stairwell-honeycomb",
    hungerRestore: 60,
  },
  {
    slug: "lamplighters-supper",
    name: "The Lamplighter's Supper",
    description:
      "A tin box, still warm, holding a meal somebody packed and never came back for. Nobody has worked out the warm part.",
    type: "FOOD",
    category: "food",
    tags: ["preserved", "salvaged"],
    price: 1_100n,
    rarity: "ULTRA_RARE",
    artKey: "lamplighters-supper",
    hungerRestore: 75,
  },
  {
    slug: "deepwater-pear",
    name: "Deepwater Pear",
    description:
      "Grown in the dark on a tree that gets no light and does not appear to mind. Pale as a candle and sweeter than one.",
    type: "FOOD",
    category: "food",
    tags: ["sweet", "foraged"],
    price: 750n,
    rarity: "ULTRA_RARE",
    artKey: "deepwater-pear",
    hungerRestore: 45,
  },

  // ---- Toys -----------------------------------------------------------
  {
    slug: "echo-bell",
    name: "Echo Bell",
    description:
      "A hand bell that answers itself about four seconds late, in a slightly different key. Companions find this hilarious for longer than people do.",
    type: "TOY",
    category: "toys",
    tags: ["salvaged", "keepsake"],
    price: 1_300n,
    rarity: "ULTRA_RARE",
    artKey: "echo-bell",
    happinessBoost: 40,
  },
  {
    slug: "the-rolling-stone",
    name: "The Rolling Stone",
    description:
      "Perfectly round, perfectly smooth, and disinclined to stay where it is put. It has been rolling downhill for a very long time and would like to continue.",
    type: "TOY",
    category: "toys",
    tags: ["stone", "keepsake"],
    price: 1_000n,
    rarity: "ULTRA_RARE",
    artKey: "the-rolling-stone",
    happinessBoost: 32,
  },
  {
    slug: "miners-whistle",
    name: "Miner's Whistle",
    description:
      "Bone, worn glassy by a thumb. Two notes, which used to mean “coming up” and “not yet”. It has forgotten which is which.",
    type: "TOY",
    category: "toys",
    tags: ["salvaged", "keepsake"],
    price: 850n,
    rarity: "ULTRA_RARE",
    artKey: "miners-whistle",
    happinessBoost: 28,
  },
  {
    slug: "cavers-kite",
    name: "The Caver's Kite",
    description:
      "Oiled paper on a cane frame, built to be flown in a room with a ceiling. Whoever made it clearly needed something to do down there.",
    type: "TOY",
    category: "toys",
    tags: ["salvaged", "keepsake"],
    price: 1_150n,
    rarity: "ULTRA_RARE",
    artKey: "cavers-kite",
    happinessBoost: 36,
  },

  // ---- Books ----------------------------------------------------------
  {
    slug: "notes-on-the-lower-stair",
    name: "Notes on the Lower Stair",
    description:
      "Somebody's working journal of the descent, in pencil, with the doors marked. The marks are all crossed out and re-marked, several times over.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "salvaged"],
    price: 1_400n,
    rarity: "ULTRA_RARE",
    artKey: "notes-on-the-lower-stair",
  },
  {
    slug: "what-the-water-took",
    name: "What the Water Took",
    description:
      "A slim account of everything one flooded valley lost, written by somebody who stayed to watch. Kinder than the subject deserves.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "keepsake"],
    price: 1_250n,
    rarity: "ULTRA_RARE",
    artKey: "what-the-water-took",
  },
  {
    slug: "a-catalogue-of-wrong-turns",
    name: "A Catalogue of Wrong Turns",
    description:
      "Four hundred entries, each a route that did not work, each described with enormous care. The introduction insists this is the useful half.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "salvaged"],
    price: 1_600n,
    rarity: "ULTRA_RARE",
    artKey: "a-catalogue-of-wrong-turns",
  },
] as const satisfies readonly ItemContent[];

/**
 * The three hoard books, as books.
 *
 * Insight is generous but not off the ladder — these sit at the top of
 * what a title is worth, alongside the dearest thing the Bindery sells,
 * rather than above it. A book that gave ten times the insight of every
 * other book would make the shelf a scoreboard, and the shelf is a record
 * of evenings.
 */
export const caveHoardBooks = [
  {
    itemSlug: "notes-on-the-lower-stair",
    insight: 90,
    author: "hand unknown",
  },
  {
    itemSlug: "what-the-water-took",
    insight: 80,
    author: "M. Ollerenshaw",
  },
  {
    itemSlug: "a-catalogue-of-wrong-turns",
    insight: 110,
    author: "the Surveyor's Office",
  },
] as const satisfies readonly BookContent[];

/**
 * What the last room can hand over, and how often.
 *
 * Weighted rather than uniform so the pool can be widened later without
 * every entry silently becoming rarer in lockstep — and so the three
 * consumables, which a player might genuinely want twice, come up a
 * little more often than the books, which they will not.
 */
export const caveHoard = [
  { itemSlug: "stairwell-honeycomb", selectionWeight: 14 },
  { itemSlug: "lamplighters-supper", selectionWeight: 12 },
  { itemSlug: "deepwater-pear", selectionWeight: 14 },
  { itemSlug: "echo-bell", selectionWeight: 10 },
  { itemSlug: "the-rolling-stone", selectionWeight: 11 },
  { itemSlug: "miners-whistle", selectionWeight: 11 },
  { itemSlug: "cavers-kite", selectionWeight: 10 },
  { itemSlug: "notes-on-the-lower-stair", selectionWeight: 6 },
  { itemSlug: "what-the-water-took", selectionWeight: 6 },
  { itemSlug: "a-catalogue-of-wrong-turns", selectionWeight: 6 },
] as const;
