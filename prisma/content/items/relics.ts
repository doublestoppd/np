import type { ItemContent } from "../schemas";

/**
 * The far end of the catalogue: things that are genuinely hard to come by.
 *
 * These exist to give the Tumblehouse drums and the rarest random events
 * something worth landing on. Before them the catalogue topped out around
 * 2,500 coins, which made a 12,000-coin token impossible to price — there
 * was nothing at the other end of it.
 *
 * Three rules held while writing these, and they are the difference
 * between a top end and a power ladder:
 *
 * 1. **None of them do anything.** No use effect, no stat, no bonus, no
 *    unlock. They are curios — their entire job is to be kept, shown on a
 *    profile, or sold on. A rare item that made the game easier would be
 *    pay-to-win wearing a nicer coat, and the coins that buy the tokens
 *    are earned by playing.
 * 2. **Every one is a specific object with a specific history**, not
 *    "Legendary Amulet +3". The interesting part of a rare thing is what
 *    it is, and a name that only announces its tier says nothing.
 * 3. **No set, no series, no numbering.** They do not form a collection,
 *    they are not "1 of 14" anywhere, and nothing in the game will ever
 *    list which ones a player is missing (docs/profile-and-showcases.md).
 *
 * The four dearest are instanced and carry full provenance, so a player
 * can see where a thing came from and who has had it. That is worth doing
 * for objects this scarce and pointless for a stack of apples.
 */
export const relicItems = [
  {
    slug: "cloudglass-prism",
    name: "Cloudglass Prism",
    description:
      "A wedge of glass that throws a rainbow in flat grey light and nothing at all in sunshine. Nobody sensible has explained this and the unsensible explanations are better.",
    type: null,
    category: "curios",
    tags: ["glass", "keepsake"],
    price: 1_600n,
    rarity: "ULTRA_RARE",
    artKey: "cloudglass-prism",
  },
  {
    slug: "the-unfinished-map",
    name: "The Unfinished Map",
    description:
      "Beautifully drawn as far as the third fold, then blank. The blank part is labelled, in a careful hand, LATER.",
    type: null,
    category: "curios",
    tags: ["keepsake", "salvaged"],
    price: 2_100n,
    rarity: "ULTRA_RARE",
    artKey: "the-unfinished-map",
  },
  {
    slug: "nightjar-weathervane",
    name: "Nightjar Weathervane",
    description:
      "A small iron bird on a spindle. It turns into the wind like any vane and then, some evenings, keeps turning.",
    type: null,
    category: "curios",
    tags: ["metal", "keepsake"],
    price: 2_600n,
    rarity: "ULTRA_RARE",
    artKey: "nightjar-weathervane",
  },
  {
    slug: "thundershard",
    name: "Thundershard",
    description:
      "Sand fused to glass by a strike, dug out of a hillside in the shape the lightning took. Holding it makes the hair on your arm stand up, which is either physics or suggestion.",
    type: null,
    category: "curios",
    tags: ["stone", "glass"],
    price: 3_200n,
    rarity: "ULTRA_RARE",
    artKey: "thundershard",
  },
  {
    slug: "the-longest-feather",
    name: "The Longest Feather",
    description:
      "Longer than the bird it presumably came off. Barred grey and white and warm to the touch in a way feathers are not.",
    type: null,
    category: "curios",
    tags: ["keepsake", "woodland"],
    price: 3_800n,
    rarity: "ULTRA_RARE",
    artKey: "the-longest-feather",
  },
  {
    slug: "silverwake-astrolabe",
    name: "Silverwake Astrolabe",
    description:
      "Rings inside rings, every one of them engraved for stars that are not up there. It is beautifully made and comprehensively wrong.",
    type: null,
    category: "curios",
    tags: ["metal", "salvaged"],
    price: 4_500n,
    rarity: "ULTRA_RARE",
    artKey: "silverwake-astrolabe",
  },
  {
    slug: "deepwater-pearl",
    name: "Deepwater Pearl",
    description:
      "Grey-green and the size of a knuckle, from water nobody has found the bottom of. It is cold in the hand for longer than it should be.",
    type: null,
    category: "curios",
    tags: ["freshwater", "keepsake"],
    price: 5_200n,
    rarity: "ULTRA_RARE",
    artKey: "deepwater-pearl",
  },
  {
    slug: "the-patient-hourglass",
    name: "The Patient Hourglass",
    description:
      "Turn it and the sand takes an hour. Turn it again straight away and the sand takes an hour. Turn it eleven times in a row and, reportedly, it takes rather longer.",
    type: null,
    category: "curios",
    tags: ["glass", "keepsake"],
    price: 6_000n,
    rarity: "ULTRA_RARE",
    artKey: "the-patient-hourglass",
  },
  {
    slug: "moth-wing-lantern",
    name: "Moth-Wing Lantern",
    description:
      "Panes of something thinner than paper and stronger than it has any right to be. The light through it is the colour of an evening in late summer.",
    type: null,
    category: "curios",
    tags: ["lit", "glass"],
    price: 7_000n,
    rarity: "ULTRA_RARE",
    artKey: "moth-wing-lantern",
  },
  {
    slug: "the-quiet-chord",
    name: "The Quiet Chord",
    description:
      "A tuning fork with three tines. Struck, it produces a note you feel in your teeth and cannot afterwards hum.",
    type: null,
    category: "curios",
    tags: ["metal", "keepsake"],
    price: 8_400n,
    rarity: "ULTRA_RARE",
    artKey: "the-quiet-chord",
  },
  {
    slug: "hollowheart-seed",
    name: "Hollowheart Seed",
    description:
      "A seed the size of a fist with a hollow in it, and something in the hollow that rattles. Planting it is traditionally regarded as somebody else's idea.",
    type: null,
    category: "curios",
    tags: ["growing", "woodland"],
    price: 9_500n,
    rarity: "ULTRA_RARE",
    artKey: "hollowheart-seed",
    stackable: false,
    provenancePolicy: "ORIGINAL_SOURCE",
  },
  {
    slug: "the-drowned-bell",
    name: "The Drowned Bell",
    description:
      "Small, green with age, and full of silt from wherever it spent the last century. It does not ring. People keep trying.",
    type: null,
    category: "curios",
    tags: ["metal", "salvaged"],
    price: 11_000n,
    rarity: "ULTRA_RARE",
    artKey: "the-drowned-bell",
    stackable: false,
    provenancePolicy: "FULL_HISTORY",
  },
  {
    slug: "ninefold-compass-rose",
    name: "Ninefold Compass Rose",
    description:
      "Cut from a single piece of pale horn, with nine points where there are conventionally four. Two of the nine are unlabelled.",
    type: null,
    category: "curios",
    tags: ["keepsake", "salvaged"],
    price: 14_000n,
    rarity: "ULTRA_RARE",
    artKey: "ninefold-compass-rose",
    stackable: false,
    provenancePolicy: "FULL_HISTORY",
  },
  {
    slug: "the-first-lantern",
    name: "The First Lantern",
    description:
      "Older than the practice of hanging them out, and the reason for it. Every lantern in three regions is a copy of a copy of this, and none of them are very good copies.",
    type: null,
    category: "curios",
    tags: ["lit", "metal"],
    price: 18_000n,
    rarity: "ULTRA_RARE",
    artKey: "the-first-lantern",
    stackable: false,
    provenancePolicy: "FULL_HISTORY",
  },
] satisfies ItemContent[];
