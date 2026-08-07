/**
 * Which sourced icon stands in for each item, until original art exists.
 *
 * Every value is `<author>/<icon>` in the game-icons.net collection
 * (https://github.com/game-icons/icons), which is the source we use for
 * item placeholders: one coherent silhouette style across 4,000+ symbols,
 * CC BY 3.0, and plain SVG paths we can tint from the palette tokens. The
 * author segment is not decoration — it is half the attribution the
 * licence requires, and it disambiguates the handful of icon names that
 * exist in more than one contributor's folder.
 *
 * Author folders are part of the identifier, so moving an icon between
 * folders upstream is a breaking change here; the build script fails loudly
 * rather than silently dropping an item back to its category shape.
 *
 * Choosing rules, in order:
 *
 * 1. **Read at 48px.** Most of these are rendered into a thumbnail beside
 *    a name. An intricate icon that is "more accurate" but turns to mush
 *    small is the wrong choice — the silhouette is the whole signal.
 * 2. **Distinct within a category.** Two foods must not share an icon.
 *    Players scan the satchel by shape long before they read it, and two
 *    identical shapes is the exact failure the old four-shapes-by-category
 *    placeholder had.
 * 3. **Describe the object, never its worth.** No icon is chosen to look
 *    rarer, and nothing here encodes value, quality, or rank.
 */
export const ITEM_ICON_MAP: Record<string, string> = {
  // ---- Food ----------------------------------------------------------
  "acorn-tea": "lorc/teapot",
  "apple-clover-tart": "lorc/pie-slice",
  "berry-jam-toast": "delapouite/butter-toast",
  "bittergreen-broth": "caro-asercion/bowl-of-rice",
  "brine-pickled-roots": "delapouite/pickle",
  "cinnamon-moss-cake": "lorc/cake-slice",
  "cloudberry-muffin": "delapouite/cupcake",
  "crispleaf-salad": "skoll/fruit-bowl",
  "drizzle-cake": "delapouite/stairs-cake",
  "hardtack-square": "delapouite/cookie",
  "herb-flecked-bread": "lorc/sliced-bread",
  "honey-oat-biscuit": "delapouite/gingerbread-man",
  "honey-oat-loaf": "delapouite/bread",
  "honeyed-shoreberries": "delapouite/berries-bowl",
  "mossberry-jam": "delapouite/honey-jar",
  "mushroom-hand-pie": "delapouite/pie-chart",
  "pear-and-thyme-scone": "delapouite/bread-slice",
  "river-melon-slice": "delapouite/watermelon",
  "riverweed-crisps": "delapouite/canned-fish",
  "roasted-mooncarrot": "delapouite/carrot",
  "salt-crust-roll": "delapouite/croissant",
  "storm-preserve": "caro-asercion/mason-jar",
  "sunberry-cluster": "delapouite/berry-bush",
  "toasted-nutcake": "delapouite/donut",
  "warm-root-stew": "delapouite/cooking-pot",

  // ---- Curios --------------------------------------------------------
  "beacon-lamp-glass": "delapouite/lighthouse",
  "bent-brass-hinge": "delapouite/hook",
  "chipped-enamel-mug": "lorc/coffee-mug",
  "crown-of-quiet-lanterns": "lorc/crown",
  "dewdrop-vial": "sbed/vial",
  "echo-shell": "lorc/spiral-shell",
  "fernlight-lantern": "delapouite/old-lantern",
  "gilded-acorn": "lorc/acorn",
  "glasswing-music-box": "delapouite/ring-box",
  "grovewardens-compass": "lorc/compass",
  "moonglass-teacup": "delapouite/coffee-cup",
  "mossy-brass-button": "delapouite/shirt-button",
  "netted-glass-float": "delapouite/glass-ball",
  "one-left-boot": "delapouite/rubber-boot",
  "painted-river-pebble": "lorc/rock",
  "patchwork-ribbon": "lorc/ribbon",
  "pressed-fern-frond": "delapouite/fern",
  "river-glass-pebble": "lorc/gems",
  "salt-rakers-tally": "delapouite/abacus",
  "salvagers-tide-clock": "lorc/hourglass",
  "silvercloud-keepsake": "lorc/fluffy-cloud",
  "starroot-brooch": "lorc/gem-pendant",
  "sunshower-vial": "lorc/round-bottom-flask",
  "tide-worn-tin": "delapouite/opened-food-can",
  "tiny-copper-bell": "lorc/ringing-bell",
  "unclaimed-lot-key": "delapouite/pendant-key",
  "unremarkable-acorn": "delapouite/plant-seed",
  "wanderers-first-map": "lorc/treasure-map",
  "waterlogged-luggage-tag": "delapouite/price-tag",
  "whispering-compass": "delapouite/sextant",
  "woven-fern-bookmark": "lorc/bookmark",

  // ---- Toys ----------------------------------------------------------
  "bounce-burr": "skoll/spiked-ball",
  "driftwood-whirligig": "delapouite/paper-windmill",
  "knotwork-ball": "delapouite/knot",
  "patchwork-kite": "delapouite/kite",
  "puzzle-pebbles": "delapouite/puzzle",
  "sailcloth-glider": "delapouite/hang-glider",
  "singing-jar": "delapouite/cloth-jar",
  "tumble-top": "skoll/spinning-top",
  "whistle-feather": "lorc/feather",

  // ---- Furnishings ---------------------------------------------------
  // These are also rendered as scene silhouettes in the Hollow, so the
  // reading test here is stricter: it has to say what the object is from
  // across a picture, not just in a list.
  "bell-for-nobody": "delapouite/hanging-sign",
  "boot-scraper": "delapouite/wooden-clogs",
  "creeping-feathermoss": "delapouite/grass",
  "glasshouse-frame": "delapouite/greenhouse",
  "hundred-year-oak": "lorc/oak",
  "jar-of-kept-light": "delapouite/covered-jar",
  "kettle-on-a-hook": "delapouite/camp-cooking-pot",
  "kitchen-garden-row": "delapouite/high-grass",
  lanternbough: "lorc/lantern-flame",
  "long-bench": "delapouite/park-bench",
  "low-clay-basin": "delapouite/bamboo-fountain",
  "quickthorn-hedge": "lorc/thorny-vine",
  "rainkeepers-basin": "delapouite/full-wood-bucket",
  "slipbark-sapling": "delapouite/seedling",
  "someones-initials": "lorc/wooden-sign",
  "standing-stone-pair": "delapouite/menhir",
  "steadying-stone": "lorc/stone-block",
  "sunken-doorstep": "delapouite/stairs",
  "the-listening-arch": "delapouite/dolmen",
  "the-long-gate": "delapouite/ranch-gate",
  "the-quiet-orrery": "caro-asercion/orrery",
  "the-slow-fountain": "delapouite/water-fountain",
  "the-weather-stone": "delapouite/stone-wheel",
  "upturned-crate": "delapouite/wooden-crate",
  "washing-line": "caro-asercion/clothesline",
  "wayward-signpost": "delapouite/direction-sign",
};

/**
 * Contributors whose icons are used, named exactly as the collection's own
 * licence file names them. Kept beside the map so adding an icon from a
 * new folder makes the missing credit obvious at review time rather than
 * at licence-audit time — the build script refuses to run without it.
 *
 * `url` is null where the collection lists no link for that contributor;
 * CC BY asks for the name, and inventing a link for someone would be worse
 * than omitting one.
 */
export const ICON_AUTHORS: Record<string, { name: string; url: string | null }> =
  {
    lorc: { name: "Lorc", url: "https://lorcblog.blogspot.com" },
    delapouite: { name: "Delapouite", url: "https://delapouite.com" },
    skoll: { name: "Skoll", url: null },
    sbed: {
      name: "Sbed",
      url: "https://opengameart.org/content/95-game-icons",
    },
    "caro-asercion": { name: "Caro Asercion", url: null },
  };

/**
 * Which sourced icon is the subject of each place, and which region's
 * ground it stands on.
 *
 * Locations used to be hand-drawn scene by scene, which produced sixteen
 * pictures of sixteen different qualities and one recurring failure: the
 * two region heroes and the world map had no subject at all, just a
 * backdrop and a caption. A named silhouette over the region's own ground
 * gives every place something to be, in the same visual language the
 * items now speak.
 *
 * `terrain` picks the painted ground underneath — woodland green or the
 * salt flats' grey — and that part stays original. It is the thing that
 * makes Saltmere not look like Dapplewood, and no icon can carry it.
 */
export type PlaceTerrain = "wood" | "flats";

export const PLACE_ICON_MAP: Record<
  string,
  { terrain: PlaceTerrain; icon: string }
> = {
  // ---- Regions -------------------------------------------------------
  dapplewood: { terrain: "wood", icon: "delapouite/forest" },
  saltmere: { terrain: "flats", icon: "delapouite/swamp" },

  // ---- Dapplewood ----------------------------------------------------
  "mosslight-clearing": { terrain: "wood", icon: "delapouite/circle-forest" },
  "old-footbridge": { terrain: "wood", icon: "delapouite/stone-bridge" },
  "toadstool-hollow": { terrain: "wood", icon: "delapouite/mushrooms-cluster" },
  "the-mossy-market": { terrain: "wood", icon: "delapouite/shop" },
  "the-listening-stump": { terrain: "wood", icon: "delapouite/stump-regrowth" },
  "whisperleaf-reading-room": { terrain: "wood", icon: "delapouite/bookshelf" },
  "brassbell-pavilion": { terrain: "wood", icon: "delapouite/medieval-pavilion" },
  "hearth-and-ladle": { terrain: "wood", icon: "delapouite/fireplace" },

  // ---- Saltmere ------------------------------------------------------
  "lowwater-landing": { terrain: "flats", icon: "delapouite/harbor-dock" },
  "the-wrackline": { terrain: "flats", icon: "delapouite/high-tide" },
  "the-drying-sheds": { terrain: "flats", icon: "delapouite/barn" },
  "the-salt-larder": { terrain: "flats", icon: "delapouite/cellar-barrels" },
  "the-found-counter": { terrain: "flats", icon: "delapouite/desk" },
  "the-mending-yard": { terrain: "flats", icon: "lorc/anvil" },
  "the-quiet-beacon": { terrain: "flats", icon: "delapouite/lighthouse" },
  // Shares a silhouette with the Sunken Doorstep furnishing. Allowed
  // across maps and not within one: a place and an object never appear
  // beside each other, so there is nothing to confuse.
  "the-deepwater-steps": { terrain: "flats", icon: "delapouite/stairs" },
};

/**
 * The shopkeepers.
 *
 * Kept separate from places because they are portraits rather than
 * scenery, and because the world model is explicit that a keeper is
 * static presentation content — a picture and nothing else, with no
 * dialogue, schedule, or character simulation behind it.
 */
export const KEEPER_ICON_MAP: Record<string, string> = {
  "keeper-hedgehog": "caro-asercion/hedgehog",
  "keeper-heron": "caro-asercion/heron",
  "keeper-tortoise": "delapouite/tortoise",
  // The nearest thing the collection has to a stick insect, and near
  // enough for a placeholder: long, thin, and unmistakably an insect.
  "keeper-stick-insect": "delapouite/praying-mantis",
};
