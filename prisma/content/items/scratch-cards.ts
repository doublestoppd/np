import type { ItemContent, ScratchCardContent } from "../schemas";

/**
 * Salt chits — three tiers of scratch card, and their prize tables.
 *
 * These are a game of chance, which the design philosophy is wary of, so
 * the shape is deliberate and the rules below are not decoration
 * (ADR-46):
 *
 * 1. **The odds are published.** Every weight here is rendered as a
 *    percentage on the item page and inside the confirm dialog, before
 *    anybody spends anything. Weights are basis points and the active ones
 *    must sum to exactly 10000, so the published table is arithmetically
 *    the table the draw runs.
 * 2. **There are no blanks.** Every outcome returns something. A card that
 *    can pay nothing is where the sting lives, and this game does not do
 *    stings.
 * 3. **Expected value is below the price, always.** Validation computes it
 *    and fails the build otherwise. A chit that paid its own way would be
 *    a coin printer with a scratching animation; the point is a sink with
 *    variance, and the product being sold is the chance at something you
 *    cannot easily buy.
 * 4. **A chit never awards a chit.** Validation refuses it. That is the
 *    mechanic that turns a curiosity into a treadmill.
 *
 * Item prizes lean deliberately toward things with no shop route — the
 * rare curiosities — because "a shot at the tide clock" is a reason to buy
 * one and "18 coins of brass button" is not.
 */
export const scratchCardItems = [
  {
    slug: "thin-salt-chit",
    name: "Thin Salt Chit",
    description:
      "A wafer of slate under a crust of dried salt. Scrape the salt off and the rakers honour whatever is written underneath.",
    type: "SCRATCH_CARD",
    category: "curios",
    tags: ["salted", "stone"],
    price: 60n,
    rarity: "COMMON",
    artKey: "thin-salt-chit",
  },
  {
    slug: "banded-salt-chit",
    name: "Banded Salt Chit",
    description:
      "Thicker slate, banded grey and white, and a heavier crust to work through. The rakers price these by how long they take to make.",
    type: "SCRATCH_CARD",
    category: "curios",
    tags: ["salted", "stone"],
    price: 180n,
    rarity: "UNCOMMON",
    artKey: "banded-salt-chit",
  },
  {
    slug: "black-salt-chit",
    name: "Black Salt Chit",
    description:
      "Dark slate from the bottom of the pans, crusted almost black. Rare enough that the rakers write the good ones down.",
    type: "SCRATCH_CARD",
    category: "curios",
    tags: ["salted", "stone"],
    price: 500n,
    rarity: "RARE",
    artKey: "black-salt-chit",
  },
] satisfies ItemContent[];

/**
 * Prize tables. Weights are basis points; the active ones must total
 * exactly 10000 per card. `npm run content:validate` prints each card's
 * expected return as a percentage of its price — read that line before
 * changing a weight.
 */
export const scratchCards = [
  {
    itemSlug: "thin-salt-chit",
    tier: 1,
    prizes: [
      { label: "A scatter of coins", kind: "COINS", coins: 20n, weight: 3200 },
      { label: "A fair few coins", kind: "COINS", coins: 35n, weight: 2600 },
      { label: "Most of your money back", kind: "COINS", coins: 50n, weight: 2000 },
      { label: "Better than you paid", kind: "COINS", coins: 75n, weight: 1300 },
      {
        label: "A pair of nutcakes",
        kind: "ITEM",
        itemSlug: "toasted-nutcake",
        quantity: 2,
        weight: 600,
      },
      {
        label: "A pane of beacon glass",
        kind: "ITEM",
        itemSlug: "beacon-lamp-glass",
        weight: 250,
      },
      {
        label: "A jar of storm preserve",
        kind: "ITEM",
        itemSlug: "storm-preserve",
        weight: 45,
      },
      {
        label: "A netted glass float",
        kind: "ITEM",
        itemSlug: "netted-glass-float",
        weight: 5,
      },
    ],
  },
  {
    itemSlug: "banded-salt-chit",
    tier: 2,
    prizes: [
      { label: "A scatter of coins", kind: "COINS", coins: 60n, weight: 3000 },
      { label: "A fair few coins", kind: "COINS", coins: 110n, weight: 2500 },
      { label: "Most of your money back", kind: "COINS", coins: 160n, weight: 2000 },
      { label: "Better than you paid", kind: "COINS", coins: 220n, weight: 1200 },
      {
        label: "A drizzle cake",
        kind: "ITEM",
        itemSlug: "drizzle-cake",
        weight: 800,
      },
      {
        label: "A sailcloth glider",
        kind: "ITEM",
        itemSlug: "sailcloth-glider",
        weight: 400,
      },
      {
        label: "A salvager's tide clock",
        kind: "ITEM",
        itemSlug: "salvagers-tide-clock",
        weight: 90,
      },
      {
        label: "A gilded acorn",
        kind: "ITEM",
        itemSlug: "gilded-acorn",
        weight: 10,
      },
    ],
  },
  {
    itemSlug: "black-salt-chit",
    tier: 3,
    prizes: [
      { label: "A scatter of coins", kind: "COINS", coins: 150n, weight: 2800 },
      { label: "A fair few coins", kind: "COINS", coins: 280n, weight: 2500 },
      { label: "Most of your money back", kind: "COINS", coins: 420n, weight: 2000 },
      { label: "Better than you paid", kind: "COINS", coins: 600n, weight: 1300 },
      {
        label: "A netted glass float",
        kind: "ITEM",
        itemSlug: "netted-glass-float",
        weight: 900,
      },
      {
        label: "A whispering compass",
        kind: "ITEM",
        itemSlug: "whispering-compass",
        weight: 400,
      },
      {
        label: "A crown of quiet lanterns",
        kind: "ITEM",
        itemSlug: "crown-of-quiet-lanterns",
        weight: 80,
      },
      {
        label: "An unclaimed lot key",
        kind: "ITEM",
        itemSlug: "unclaimed-lot-key",
        weight: 18,
      },
      {
        label: "The Grovewarden's compass",
        kind: "ITEM",
        itemSlug: "grovewardens-compass",
        weight: 2,
      },
    ],
  },
] satisfies ScratchCardContent[];
