import type { ItemContent } from "../schemas";

/**
 * Furnishings: things you stand somewhere rather than use.
 *
 * Three rules hold this catalogue together, and all three exist to stop it
 * turning into a checklist:
 *
 * 1. **Buy the same thing as many times as you like, at the same price,
 *    forever.** Three stones make a path; one makes a place to sit. If a
 *    thing is worth owning five times, "one of each" is visibly not the
 *    goal, and there is no state in which you have bought everything.
 * 2. **Nothing is rarer than anything else.** No rarity tiers, no limited
 *    windows, no retirement-as-scarcity. Everything here is buyable by
 *    anyone at a fixed price for as long as the game exists, so the
 *    reaction to somebody else's Hollow is "where did you get that" and
 *    the answer is always "the catalogue, and here is what it costs".
 * 3. **Nothing here does anything.** No effects, no bonuses, no object
 *    that is better beside another object. They are pictures you paid for.
 *
 * Sizes are a rendering contract — what fits where — and never a rank.
 * `growthDays` starts a clock that only real time advances.
 */
export const furnishingItems = [
  // ---- Small: 180-900. Punctuation. Bought in threes and fours. ----
  {
    slug: "steadying-stone",
    name: "Steadying Stone",
    description:
      "A flat stone at exactly sitting height. Somebody put it here on purpose, a long time ago, and never said why.",
    type: null,
    category: "furnishings",
    tags: ["stone", "standing"],
    price: 180n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "steadying-stone",
    furnishing: { size: "SMALL" },
  },
  {
    slug: "kettle-on-a-hook",
    name: "Kettle on a Hook",
    description:
      "Always warm. Nobody has ever seen it filled, and nobody has thought to ask.",
    type: null,
    category: "furnishings",
    tags: ["metal", "standing"],
    price: 260n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "kettle-on-a-hook",
    furnishing: { size: "SMALL" },
  },
  {
    slug: "upturned-crate",
    name: "Upturned Crate",
    description:
      "A table if you are not fussy, a chair if you are shorter than you were.",
    type: null,
    category: "furnishings",
    tags: ["wood", "salvaged", "standing"],
    price: 240n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "upturned-crate",
    furnishing: { size: "SMALL" },
  },
  {
    slug: "bell-for-nobody",
    name: "Bell for Nobody",
    description:
      "Rung by the wind, occasionally by intent. It has never once been answered.",
    type: null,
    category: "furnishings",
    tags: ["metal", "standing"],
    price: 420n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "bell-for-nobody",
    furnishing: { size: "SMALL" },
  },
  {
    slug: "boot-scraper",
    name: "Boot Scraper",
    description:
      "Iron, opinionated, and set into the ground at the exact angle of somebody who was tired of mud.",
    type: null,
    category: "furnishings",
    tags: ["metal", "standing"],
    price: 330n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "boot-scraper",
    furnishing: { size: "SMALL" },
  },
  {
    slug: "jar-of-kept-light",
    name: "Jar of Kept Light",
    description:
      "A preserving jar with an afternoon in it. Considerably better under a late air.",
    type: null,
    category: "furnishings",
    tags: ["glass", "lit", "standing"],
    price: 640n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "jar-of-kept-light",
    furnishing: { size: "SMALL" },
  },
  {
    slug: "low-clay-basin",
    name: "Low Clay Basin",
    description:
      "Shallow, wide, and always holding a finger's depth of something. Birds have decided it is theirs.",
    type: null,
    category: "furnishings",
    tags: ["stone", "water", "standing"],
    price: 520n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "low-clay-basin",
    furnishing: { size: "SMALL" },
  },
  {
    slug: "someones-initials",
    name: "Someone's Initials",
    description:
      "Two letters cut into a post by a hand that pressed too hard on the second one.",
    type: null,
    category: "furnishings",
    tags: ["wood", "keepsake", "standing"],
    price: 850n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "someones-initials",
    furnishing: { size: "SMALL" },
  },

  // ---- Middling: 1,200-4,800. Furniture proper. ----
  {
    slug: "lanternbough",
    name: "Lanternbough",
    description:
      "A branch that agreed, at some point, to hold lights. It has held them ever since without complaint.",
    type: null,
    category: "furnishings",
    tags: ["wood", "lit", "standing"],
    price: 1_400n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "lanternbough",
    furnishing: { size: "MEDIUM" },
  },
  {
    slug: "sunken-doorstep",
    name: "Sunken Doorstep",
    description:
      "The step of a house that is no longer above it. It implies a different absent building in every place you set it down.",
    type: null,
    category: "furnishings",
    tags: ["stone", "salvaged", "standing"],
    price: 2_200n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "sunken-doorstep",
    furnishing: { size: "MEDIUM" },
  },
  {
    slug: "long-bench",
    name: "Long Bench",
    description:
      "Seats four, or one person four times over the course of an afternoon.",
    type: null,
    category: "furnishings",
    tags: ["wood", "standing"],
    price: 1_800n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "long-bench",
    furnishing: { size: "MEDIUM" },
  },
  {
    slug: "wayward-signpost",
    name: "Wayward Signpost",
    description:
      "Four arms, no legible destinations, complete confidence. Point two of them differently and the whole place is somewhere else.",
    type: null,
    category: "furnishings",
    tags: ["wood", "standing"],
    price: 3_600n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "wayward-signpost",
    furnishing: { size: "MEDIUM" },
  },
  {
    slug: "washing-line",
    name: "Washing Line",
    description:
      "Strung between whatever is nearest. Nothing on it belongs to anyone who lives here.",
    type: null,
    category: "furnishings",
    tags: ["standing"],
    price: 1_250n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "washing-line",
    furnishing: { size: "MEDIUM" },
  },
  {
    slug: "slipbark-sapling",
    name: "Slipbark Sapling",
    description:
      "Plant it and it is a tree in about two months. There is no way at all to hurry it, and everyone has tried.",
    type: null,
    category: "furnishings",
    tags: ["growing", "woodland", "standing"],
    price: 4_800n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "slipbark-sapling",
    furnishing: { size: "MEDIUM", growthDays: 60 },
  },

  // ---- Large: 6,500-22,000. Things that change the shape of a place. ----
  {
    slug: "creeping-feathermoss",
    name: "Creeping Feathermoss",
    description:
      "Spreads over whatever it is nearest, slowly, across about six weeks. It takes the shape of what it grows over, so no two are ever the same object.",
    type: null,
    category: "furnishings",
    tags: ["growing", "foraged", "standing"],
    price: 6_500n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "creeping-feathermoss",
    furnishing: { size: "LARGE", growthDays: 42 },
  },
  {
    slug: "rainkeepers-basin",
    name: "Rainkeeper's Basin",
    description:
      "A stone basin always slightly fuller than the weather accounts for. Under a storm and under low sun it is two different paintings.",
    type: null,
    category: "furnishings",
    tags: ["stone", "water", "standing"],
    price: 11_000n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "rainkeepers-basin",
    furnishing: { size: "LARGE" },
  },
  {
    slug: "the-long-gate",
    name: "The Long Gate",
    description:
      "A gate with no fence on either side of it. Ceremonial, apparently. Two of them at different depths make a corridor, which one cannot.",
    type: null,
    category: "furnishings",
    tags: ["wood", "metal", "standing"],
    price: 16_500n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "the-long-gate",
    furnishing: { size: "LARGE" },
  },
  {
    slug: "glasshouse-frame",
    name: "Glasshouse Frame",
    description:
      "Most of the panes are gone. What is left does a remarkable amount of work with the light it is given.",
    type: null,
    category: "furnishings",
    tags: ["glass", "metal", "lit", "standing"],
    price: 22_000n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "glasshouse-frame",
    furnishing: { size: "LARGE" },
  },
  {
    slug: "standing-stone-pair",
    name: "Standing Stone Pair",
    description:
      "Two stones, leaning slightly toward each other, in the manner of people who have run out of things to say and are fine about it.",
    type: null,
    category: "furnishings",
    tags: ["stone", "standing"],
    price: 8_400n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "standing-stone-pair",
    furnishing: { size: "LARGE" },
  },

  {
    slug: "quickthorn-hedge",
    name: "Quickthorn Hedge",
    description:
      "Impatient. Waist-high inside a fortnight and thoroughly pleased with itself about it.",
    type: null,
    category: "furnishings",
    tags: ["growing", "woodland", "standing"],
    price: 2_900n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "quickthorn-hedge",
    furnishing: { size: "MEDIUM", growthDays: 14 },
  },
  {
    slug: "kitchen-garden-row",
    name: "Kitchen Garden Row",
    description:
      "Four kinds of something, planted in a line by somebody who knew what they were doing. Ready in about a month, whatever it is.",
    type: null,
    category: "furnishings",
    tags: ["growing", "foraged", "standing"],
    price: 3_400n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "kitchen-garden-row",
    furnishing: { size: "MEDIUM", growthDays: 32 },
  },
  {
    slug: "hundred-year-oak",
    name: "Hundred-Year Oak",
    description:
      "It will not be a hundred years old for a hundred years. It intends to start anyway, and it takes the best part of a year to look like it means it.",
    type: null,
    category: "furnishings",
    tags: ["growing", "woodland", "standing"],
    price: 30_000n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "hundred-year-oak",
    furnishing: { size: "LARGE", growthDays: 300 },
  },

  // ---- Centrepieces: 40,000-95,000. One anchor per ground takes these. ----
  {
    slug: "the-quiet-orrery",
    name: "The Quiet Orrery",
    description:
      "Brass rings turning to a schedule nobody wrote down. It does nothing whatsoever, at considerable expense.",
    type: null,
    category: "furnishings",
    tags: ["metal", "standing"],
    price: 95_000n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "the-quiet-orrery",
    furnishing: { size: "CENTREPIECE" },
  },
  {
    slug: "the-listening-arch",
    name: "The Listening Arch",
    description:
      "Speak at one foot of it and the other foot answers, a half-second late and slightly kinder.",
    type: null,
    category: "furnishings",
    tags: ["stone", "standing"],
    price: 52_000n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "the-listening-arch",
    furnishing: { size: "CENTREPIECE" },
  },
  {
    slug: "the-slow-fountain",
    name: "The Slow Fountain",
    description:
      "One drop at a time, into a bowl that has never yet overflowed and has never yet been empty.",
    type: null,
    category: "furnishings",
    tags: ["stone", "water", "standing"],
    price: 40_000n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "the-slow-fountain",
    furnishing: { size: "CENTREPIECE" },
  },
  {
    slug: "the-weather-stone",
    name: "The Weather Stone",
    description:
      "A stone on a post. Wet means rain, white means snow, gone means you should probably go indoors. It has never been wrong and has never been useful.",
    type: null,
    category: "furnishings",
    tags: ["stone", "water", "standing"],
    price: 68_000n,
    rarity: "COMMON",
    tradeable: false,
    artKey: "the-weather-stone",
    furnishing: { size: "CENTREPIECE" },
  },
] satisfies readonly ItemContent[];
