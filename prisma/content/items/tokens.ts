import type { ItemContent, SpinTokenContent } from "../schemas";

/**
 * Tumblehouse tokens — five enamelled discs, one pull each (ADR-49).
 *
 * A token is not currency and cannot be changed back. It buys exactly one
 * turn of the drums, and which token you feed in decides what is painted
 * on them: the pale one has six faces and the black one has ten, so a
 * dearer token is not merely a bigger bet, it is a visibly different
 * machine.
 *
 * Colour is the whole identity on purpose. A player who has three greens
 * and a blue in the satchel knows what they have without reading anything,
 * which is the point of a token.
 */
export const spinTokenItems = [
  {
    slug: "chalk-token",
    name: "Chalk Token",
    description:
      "A brass disc enamelled dull white, worn smooth at the edge by a great many hands. Good for one turn of the drums.",
    type: "SPIN_TOKEN",
    category: "tokens",
    tags: ["metal", "enamelled"],
    price: 120n,
    rarity: "COMMON",
    artKey: "chalk-token",
  },
  {
    slug: "verdigris-token",
    name: "Verdigris Token",
    description:
      "Green as an old roof, and heavier than the white. The drums it opens carry a face the pale token never shows.",
    type: "SPIN_TOKEN",
    category: "tokens",
    tags: ["metal", "enamelled"],
    price: 400n,
    rarity: "UNCOMMON",
    artKey: "verdigris-token",
  },
  {
    slug: "cobalt-token",
    name: "Cobalt Token",
    description:
      "Deep blue enamel over brass, the colour laid on thick enough to feel. The house keeps these behind the counter.",
    type: "SPIN_TOKEN",
    category: "tokens",
    tags: ["metal", "enamelled"],
    price: 1_300n,
    rarity: "RARE",
    artKey: "cobalt-token",
  },
  {
    slug: "amber-token",
    name: "Amber Token",
    description:
      "Orange-gold and slightly translucent, so it lights up if you hold it toward a window. Rarely more than one in the house at a time.",
    type: "SPIN_TOKEN",
    category: "tokens",
    tags: ["metal", "enamelled"],
    price: 4_000n,
    rarity: "RARE",
    artKey: "amber-token",
  },
  {
    slug: "obsidian-token",
    name: "Obsidian Token",
    description:
      "Black enamel, no shine to it at all, and cold for longer than brass should be. The drums it opens have ten faces and nobody has seen all ten come up.",
    type: "SPIN_TOKEN",
    category: "tokens",
    tags: ["metal", "enamelled"],
    price: 12_000n,
    rarity: "ULTRA_RARE",
    artKey: "obsidian-token",
  },
] satisfies ItemContent[];

/**
 * The drum tables. Weights are basis points and the active ones must
 * total exactly 10000 per tier.
 *
 * **The shape is the design: most pulls lose.** Roughly three in four
 * come up short, and the two commonest wins are worth rather less than
 * the token — because a machine where the ordinary win returns your money
 * has no reason for anyone to keep pulling, and a machine where it does
 * not is the one everybody actually remembers.
 *
 * Each winning outcome owns exactly one drum face, and a tier's `faces`
 * count equals its number of winning outcomes — validated offline. That
 * is what lets the machine show a ladder honestly: every face on the drum
 * is a real prize somebody could land, with no decoration that pays
 * nothing.
 *
 * The odds are NOT published, exactly as with the chits (ADR-48). The
 * ladder is: a player can see the Ninefold Compass Rose is on the black
 * drum and find out how often the hard way.
 *
 * The one rule that binds is economics rather than taste: **expected
 * return stays below the token price**, checked by
 * `npm run content:validate`, which prints each tier's return in the same
 * run as the change. A token that paid its own way would be an
 * infinite-coin loop with a spinning animation.
 */
export const spinTokens = [
  {
    itemSlug: "chalk-token",
    tier: 1,
    faces: 6,
    prizes: [
      { label: "The drums disagree", kind: "NOTHING", weight: 7400 },
      { label: "A short row", kind: "COINS", coins: 210n, faceIndex: 0, weight: 1600 },
      { label: "A good row", kind: "COINS", coins: 620n, faceIndex: 1, weight: 700 },
      {
        label: "A pane of beacon glass",
        kind: "ITEM",
        itemSlug: "beacon-lamp-glass",
        faceIndex: 2,
        weight: 180,
      },
      {
        label: "An echo shell",
        kind: "ITEM",
        itemSlug: "echo-shell",
        faceIndex: 3,
        weight: 90,
      },
      { label: "The white house pays", kind: "COINS", coins: 3_400n, faceIndex: 4, weight: 28 },
      {
        label: "A crown of quiet lanterns",
        kind: "ITEM",
        itemSlug: "crown-of-quiet-lanterns",
        faceIndex: 5,
        weight: 2,
      },
    ],
  },
  {
    itemSlug: "verdigris-token",
    tier: 2,
    faces: 7,
    prizes: [
      { label: "The drums disagree", kind: "NOTHING", weight: 7450 },
      { label: "A short row", kind: "COINS", coins: 700n, faceIndex: 0, weight: 1550 },
      { label: "A good row", kind: "COINS", coins: 2_100n, faceIndex: 1, weight: 680 },
      {
        label: "A salvager's tide clock",
        kind: "ITEM",
        itemSlug: "salvagers-tide-clock",
        faceIndex: 2,
        weight: 180,
      },
      {
        label: "A glasswing music box",
        kind: "ITEM",
        itemSlug: "glasswing-music-box",
        faceIndex: 3,
        weight: 90,
      },
      { label: "The green house pays", kind: "COINS", coins: 11_000n, faceIndex: 4, weight: 34 },
      {
        label: "A gilded acorn",
        kind: "ITEM",
        itemSlug: "gilded-acorn",
        faceIndex: 5,
        weight: 14,
      },
      {
        label: "A cloudglass prism",
        kind: "ITEM",
        itemSlug: "cloudglass-prism",
        faceIndex: 6,
        weight: 2,
      },
    ],
  },
  {
    itemSlug: "cobalt-token",
    tier: 3,
    faces: 8,
    prizes: [
      { label: "The drums disagree", kind: "NOTHING", weight: 7500 },
      { label: "A short row", kind: "COINS", coins: 2_300n, faceIndex: 0, weight: 1500 },
      { label: "A good row", kind: "COINS", coins: 6_800n, faceIndex: 1, weight: 660 },
      {
        label: "A whispering compass",
        kind: "ITEM",
        itemSlug: "whispering-compass",
        faceIndex: 2,
        weight: 170,
      },
      {
        label: "An unclaimed lot key",
        kind: "ITEM",
        itemSlug: "unclaimed-lot-key",
        faceIndex: 3,
        weight: 100,
      },
      { label: "The blue house pays", kind: "COINS", coins: 36_000n, faceIndex: 4, weight: 44 },
      {
        label: "The unfinished map",
        kind: "ITEM",
        itemSlug: "the-unfinished-map",
        faceIndex: 5,
        weight: 20,
      },
      {
        label: "A nightjar weathervane",
        kind: "ITEM",
        itemSlug: "nightjar-weathervane",
        faceIndex: 6,
        weight: 5,
      },
      {
        label: "A thundershard",
        kind: "ITEM",
        itemSlug: "thundershard",
        faceIndex: 7,
        weight: 1,
      },
    ],
  },
  {
    itemSlug: "amber-token",
    tier: 4,
    faces: 9,
    prizes: [
      { label: "The drums disagree", kind: "NOTHING", weight: 7550 },
      { label: "A short row", kind: "COINS", coins: 7_000n, faceIndex: 0, weight: 1480 },
      { label: "A good row", kind: "COINS", coins: 21_000n, faceIndex: 1, weight: 640 },
      {
        label: "The Grovewarden's compass",
        kind: "ITEM",
        itemSlug: "grovewardens-compass",
        faceIndex: 2,
        weight: 160,
      },
      {
        label: "The longest feather",
        kind: "ITEM",
        itemSlug: "the-longest-feather",
        faceIndex: 3,
        weight: 84,
      },
      { label: "The amber house pays", kind: "COINS", coins: 112_000n, faceIndex: 4, weight: 46 },
      {
        label: "A silverwake astrolabe",
        kind: "ITEM",
        itemSlug: "silverwake-astrolabe",
        faceIndex: 5,
        weight: 26,
      },
      {
        label: "A deepwater pearl",
        kind: "ITEM",
        itemSlug: "deepwater-pearl",
        faceIndex: 6,
        weight: 10,
      },
      {
        label: "The patient hourglass",
        kind: "ITEM",
        itemSlug: "the-patient-hourglass",
        faceIndex: 7,
        weight: 3,
      },
      {
        label: "A moth-wing lantern",
        kind: "ITEM",
        itemSlug: "moth-wing-lantern",
        faceIndex: 8,
        weight: 1,
      },
    ],
  },
  {
    itemSlug: "obsidian-token",
    tier: 5,
    faces: 10,
    prizes: [
      { label: "The drums disagree", kind: "NOTHING", weight: 7600 },
      { label: "A short row", kind: "COINS", coins: 21_000n, faceIndex: 0, weight: 1450 },
      { label: "A good row", kind: "COINS", coins: 63_000n, faceIndex: 1, weight: 620 },
      {
        label: "The quiet chord",
        kind: "ITEM",
        itemSlug: "the-quiet-chord",
        faceIndex: 2,
        weight: 150,
      },
      {
        label: "A hollowheart seed",
        kind: "ITEM",
        itemSlug: "hollowheart-seed",
        faceIndex: 3,
        weight: 88,
      },
      { label: "The black house pays", kind: "COINS", coins: 340_000n, faceIndex: 4, weight: 48 },
      {
        label: "The drowned bell",
        kind: "ITEM",
        itemSlug: "the-drowned-bell",
        faceIndex: 5,
        weight: 26,
      },
      {
        label: "A ninefold compass rose",
        kind: "ITEM",
        itemSlug: "ninefold-compass-rose",
        faceIndex: 6,
        weight: 12,
      },
      {
        label: "The first lantern",
        kind: "ITEM",
        itemSlug: "the-first-lantern",
        faceIndex: 7,
        weight: 4,
      },
      {
        label: "Ten faces, all the same",
        kind: "COINS",
        coins: 2_000_000n,
        faceIndex: 8,
        weight: 1,
      },
      {
        label: "The house shuts early",
        kind: "COINS",
        coins: 900_000n,
        faceIndex: 9,
        weight: 1,
      },
    ],
  },
] satisfies SpinTokenContent[];
