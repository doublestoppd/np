import type { ItemContent, ScratchCardContent } from "../schemas";

/**
 * Salt chits — three tiers of scratch card, and their prize tables.
 *
 * Three symbols under the salt. Match all three and the chit pays what
 * that symbol is worth; two out of three pays nothing and is the most
 * common thing that happens (ADR-48).
 *
 * The odds are NOT published. What is published is the prize ladder — the
 * player can see the Grovewarden's Compass is on the black chit and that
 * the jackpot is real, and finds out how often the hard way, like anybody
 * scraping salt off a slate.
 *
 * Two rules still bind, and both are economics rather than taste:
 *
 * 1. **Expected return stays below the price.** Validation computes it,
 *    counts the jackpot slice, and fails the build otherwise. A chit that
 *    paid its own way would be an infinite-coin loop with a scratching
 *    animation, and no amount of theatre makes that not a bug.
 * 2. **A chit never awards a chit.** Nesting turns a curiosity into a
 *    self-feeding loop that never touches the rest of the game.
 *
 * Item prizes lean hard toward things with no shop route, because "a shot
 * at the tide clock" is a reason to buy one and "18 coins of brass button"
 * is not.
 */
export const scratchCardItems = [
  {
    slug: "thin-salt-chit",
    name: "Thin Salt Chit",
    description:
      "A wafer of slate under a crust of dried salt. Three marks underneath. Match all three and the rakers honour whatever it says.",
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
      "Thicker slate, banded grey and white, and a heavier crust to work through. The marks under these are worth considerably more.",
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
      "Dark slate from the bottom of the pans, crusted almost black. The rakers write down the good ones, and the book is not long.",
    type: "SCRATCH_CARD",
    category: "curios",
    tags: ["salted", "stone"],
    price: 500n,
    rarity: "RARE",
    artKey: "black-salt-chit",
  },
] satisfies ItemContent[];

/**
 * Prize tables. Weights are basis points and the active ones must total
 * exactly 10000 per card.
 *
 * The shape is the design: **most chits lose.** That is what makes the
 * ones that do not land the way they land, and it is what pays for a top
 * end worth chasing — the same expected return buys either a lot of small
 * consolations or a few genuinely large prizes, and this buys the second.
 *
 * `npm run content:validate` prints each card's expected return including
 * its jackpot slice. Read that line before changing a weight.
 */
export const scratchCards = [
  {
    itemSlug: "thin-salt-chit",
    tier: 1,
    /** Basis points of the price added to the pool on every scratch. */
    jackpotBps: 400,
    prizes: [
      { label: "Salt, and more salt", kind: "NOTHING", weight: 5400 },
      { label: "A scatter of coins", kind: "COINS", coins: 38n, weight: 2300 },
      { label: "A decent handful", kind: "COINS", coins: 105n, weight: 1400 },
      { label: "A proper turn-up", kind: "COINS", coins: 300n, weight: 600 },
      {
        label: "A pane of beacon glass",
        kind: "ITEM",
        itemSlug: "beacon-lamp-glass",
        weight: 200,
      },
      {
        label: "A jar of storm preserve",
        kind: "ITEM",
        itemSlug: "storm-preserve",
        weight: 80,
      },
      {
        label: "A netted glass float",
        kind: "ITEM",
        itemSlug: "netted-glass-float",
        weight: 18,
      },
      { label: "THE PANS", kind: "JACKPOT", weight: 2 },
    ],
  },
  {
    itemSlug: "banded-salt-chit",
    tier: 2,
    jackpotBps: 500,
    prizes: [
      { label: "Salt, and more salt", kind: "NOTHING", weight: 5600 },
      { label: "A scatter of coins", kind: "COINS", coins: 125n, weight: 2200 },
      { label: "A decent handful", kind: "COINS", coins: 340n, weight: 1300 },
      { label: "A proper turn-up", kind: "COINS", coins: 780n, weight: 600 },
      {
        label: "A salvager's tide clock",
        kind: "ITEM",
        itemSlug: "salvagers-tide-clock",
        weight: 200,
      },
      {
        label: "A crown of quiet lanterns",
        kind: "ITEM",
        itemSlug: "crown-of-quiet-lanterns",
        weight: 75,
      },
      {
        label: "A gilded acorn",
        kind: "ITEM",
        itemSlug: "gilded-acorn",
        weight: 20,
      },
      { label: "THE PANS", kind: "JACKPOT", weight: 5 },
    ],
  },
  {
    itemSlug: "black-salt-chit",
    tier: 3,
    jackpotBps: 700,
    prizes: [
      { label: "Salt, and more salt", kind: "NOTHING", weight: 5800 },
      { label: "A scatter of coins", kind: "COINS", coins: 380n, weight: 2100 },
      { label: "A decent handful", kind: "COINS", coins: 1_000n, weight: 1200 },
      { label: "A proper turn-up", kind: "COINS", coins: 2_200n, weight: 600 },
      {
        label: "A whispering compass",
        kind: "ITEM",
        itemSlug: "whispering-compass",
        weight: 200,
      },
      {
        label: "An unclaimed lot key",
        kind: "ITEM",
        itemSlug: "unclaimed-lot-key",
        weight: 75,
      },
      {
        label: "The Grovewarden's compass",
        kind: "ITEM",
        itemSlug: "grovewardens-compass",
        weight: 20,
      },
      { label: "THE PANS", kind: "JACKPOT", weight: 5 },
    ],
  },
] satisfies ScratchCardContent[];
