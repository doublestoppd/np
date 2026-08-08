import type { Tint } from "./content-tint";

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
  // The three salt chits, thin to heavy. Distinct silhouettes on purpose:
  // a player picking one out of a satchel should be able to tell the 500
  // from the 60 without reading.
  "thin-salt-chit": "lorc/stone-tablet",
  "banded-salt-chit": "skoll/tablet",
  "black-salt-chit": "lorc/rune-stone",

  // ---- Fish ----------------------------------------------------------
  // Distinct silhouettes across the ladder: a player pulling one out of a
  // satchel should be able to tell a loach from a pike without reading.
  "stone-loach": "delapouite/eel",
  "silver-dace": "delapouite/circling-fish",
  "speckled-char": "delapouite/clownfish",
  "moonscale-trout": "delapouite/double-fish",
  "deepwater-char": "delapouite/fish-scales",
  "glass-perch": "delapouite/piranha",
  "old-grandfather-pike": "lorc/angler-fish",
  "tarn-ghost": "delapouite/fish-monster",

  // ---- Drinks --------------------------------------------------------
  "pine-needle-tea": "delapouite/teapot-leaves",
  "barley-cordial": "lorc/spiral-bottle",
  "hot-blackcurrant": "lorc/snow-bottle",
  "cloudberry-fizz": "lorc/fizzing-flask",
  "juniper-warmer": "lorc/standing-potion",
  "smoked-honey-toddy": "lorc/brandy-bottle",
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

  // ---- The far end of the catalogue (ADR-49) -------------------------
  "cloudglass-prism": "delapouite/prism",
  "the-unfinished-map": "delapouite/atlas",
  "nightjar-weathervane": "delapouite/windsock",
  thundershard: "lorc/lightning-storm",
  "the-longest-feather": "lorc/two-feathers",
  "silverwake-astrolabe": "caro-asercion/astrolabe",
  "deepwater-pearl": "delapouite/oyster-pearl",
  "the-patient-hourglass": "lorc/empty-hourglass",
  "moth-wing-lantern": "lorc/paper-lantern",
  // No tuning fork in the collection. A harp is the nearest thing that
  // reads as "an object that makes a note", which is what matters here.
  "the-quiet-chord": "delapouite/harp",
  "hollowheart-seed": "lorc/apple-seeds",
  "the-drowned-bell": "lorc/bell-shield",
  "ninefold-compass-rose": "lorc/pentagram-rose",
  "the-first-lantern": "lorc/lantern",

  // ---- Tumblehouse tokens --------------------------------------------
  // Colour is the identity, and colour is not something a silhouette can
  // carry — so these are five different round things rather than five
  // copies of one disc, which at least tells them apart at a glance.
  "chalk-token": "delapouite/token",
  "verdigris-token": "delapouite/two-coins",
  "cobalt-token": "lorc/poker-hand",
  "amber-token": "lorc/medal",
  "obsidian-token": "caro-asercion/slot-machine",

  // ---- Books (ADR-50) -------------------------------------------------
  // Twenty titles and no two the same shape. A shelf where every spine is
  // the same silhouette is a shelf you cannot read at a glance, which is
  // the one thing a shelf is for.
  "a-short-account-of-weather": "delapouite/notebook",

  // ---- The hoard at the bottom of the Sunken Stair (ADR-59) ----------
  // Chosen the same way as everything else: describe the object, read at
  // 48px, and share a silhouette with nothing else in the catalogue.
  // ---- Remedies and grooming (ADR-60) -------------------------------
  "hedgerow-syrup": "lorc/drink-me",
  "kettleroot-draught": "delapouite/herbs-bundle",
  "cool-clay-salve": "lorc/potion-ball",
  "softfoot-poultice": "delapouite/knee-bandage",
  "rinsing-water": "delapouite/water-flask",
  // ---- Keepsakes a companion turns up with (ADR-61) ------------------
  "one-good-feather": "lorc/feathered-wing",
  "a-particular-pebble": "delapouite/curling-stone",
  "somebodys-button": "delapouite/button-finger",
  "a-length-of-good-string": "delapouite/rope-coil",
  "the-smoothest-acorn": "lorc/dripping-stone",
  "a-scrap-of-blue": "lorc/tattered-banner",
  "an-interesting-snail-shell": "lorc/sewed-shell",
  "a-perfectly-flat-stone": "lorc/opening-shell",

  "an-apology": "lorc/envelope",
  "greenglass-tonic": "delapouite/wine-bottle",
  "bristle-brush": "delapouite/large-paint-brush",
  "wide-tooth-comb": "lorc/comb",
  "chamois-cloth": "delapouite/towel",
  "seedburr-rake": "delapouite/rake",
  "warm-flannel": "delapouite/rolled-cloth",

  "stairwell-honeycomb": "lorc/honeycomb",
  "lamplighters-supper": "delapouite/cargo-crate",
  "deepwater-pear": "lorc/shiny-apple",
  "echo-bell": "delapouite/bellows",
  "the-rolling-stone": "lorc/stone-sphere",
  "miners-whistle": "delapouite/whistle",
  "cavers-kite": "skoll/glider",
  "notes-on-the-lower-stair": "delapouite/secret-book",
  "what-the-water-took": "lorc/open-book",
  "a-catalogue-of-wrong-turns": "delapouite/spell-book",
  "knots-for-the-impatient": "delapouite/rule-book",
  "two-hundred-uses-for-moss": "lorc/book-cover",
  "the-bee-book": "delapouite/book-cover",
  "on-walking-slowly": "lorc/folded-paper",
  "a-cooks-notes-on-roots": "delapouite/stabbed-note",
  "small-repairs": "willdabeast/white-book",
  "where-the-road-goes-abridged": "lorc/papers",
  "the-tidewatchers-almanac": "delapouite/archive-register",
  "names-for-rain": "lorc/scroll-unfurled",
  "bridges-i-have-crossed": "lorc/book-aura",
  "a-field-guide-to-things-that-are-not-there": "delapouite/archive-research",
  "the-lamplighters-round": "lorc/bookmarklet",
  "nine-ways-to-sit-still": "delapouite/wax-tablet",
  "the-deepwater-register": "delapouite/scroll-quill",
  "letters-to-a-cartographer": "delapouite/love-letter",
  "an-inventory-of-lost-bells": "lorc/quill-ink",
  "the-long-winter-ledger": "john-redman/paper",
  "the-book-of-doors": "willdabeast/black-book",
  "the-unbound-folio": "lorc/tied-scroll",
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
    "john-redman": { name: "John Redman", url: null },
    willdabeast: { name: "Willdabeast", url: null },
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
export type PlaceTerrain = "wood" | "flats" | "fell";

export const PLACE_ICON_MAP: Record<
  string,
  {
    terrain: PlaceTerrain;
    icon: string;
    /**
     * The ink the subject is painted in. One ink per region made a map of
     * eight places into eight identical green silhouettes, so each place
     * takes a hue from what it is: water blue, growing things green, the
     * fire-and-food ones warm, the quiet ones violet. The ground under
     * them stays the region's, which is what keeps a varied map still
     * obviously one place.
     */
    tint: Tint;
  }
> = {
  // ---- Regions -------------------------------------------------------
  dapplewood: { terrain: "wood", icon: "delapouite/forest" , tint: "moss" },
  saltmere: { terrain: "flats", icon: "delapouite/swamp" , tint: "tide" },

  // ---- Dapplewood ----------------------------------------------------
  "mosslight-clearing": { terrain: "wood", icon: "delapouite/circle-forest" , tint: "moss" },
  "old-footbridge": { terrain: "wood", icon: "delapouite/stone-bridge" , tint: "tide" },
  "toadstool-hollow": { terrain: "wood", icon: "delapouite/mushrooms-cluster" , tint: "berry" },
  "tanglestile-green": { terrain: "wood", icon: "delapouite/shop" , tint: "ember" },
  "beechrow-physic-garden": { terrain: "wood", icon: "delapouite/gardening-shears" , tint: "moss" },
  "the-listening-stump": { terrain: "wood", icon: "delapouite/stump-regrowth" , tint: "honey" },
  "whisperleaf-reading-room": { terrain: "wood", icon: "delapouite/bookshelf" , tint: "dusk" },
  "brassbell-pavilion": { terrain: "wood", icon: "delapouite/medieval-pavilion" , tint: "berry" },
  "hearth-and-ladle": { terrain: "wood", icon: "delapouite/fireplace" , tint: "ember" },

  // ---- Saltmere ------------------------------------------------------
  "lowwater-landing": { terrain: "flats", icon: "delapouite/harbor-dock" , tint: "tide" },
  "the-wrackline": { terrain: "flats", icon: "delapouite/high-tide" , tint: "moss" },
  "the-drying-sheds": { terrain: "flats", icon: "delapouite/barn" , tint: "honey" },
  "the-salt-larder": { terrain: "flats", icon: "delapouite/cellar-barrels" , tint: "ember" },
  "the-found-counter": { terrain: "flats", icon: "delapouite/desk" , tint: "dusk" },
  "the-mending-yard": { terrain: "flats", icon: "lorc/anvil" , tint: "honey" },
  "the-quiet-beacon": { terrain: "flats", icon: "delapouite/lighthouse" , tint: "berry" },
  // Shares a silhouette with the Sunken Doorstep furnishing. Allowed
  // across maps and not within one: a place and an object never appear
  // beside each other, so there is nothing to confuse.
  "the-deepwater-steps": { terrain: "flats", icon: "delapouite/stairs" , tint: "tide" },

  // ---- Tarnreach -----------------------------------------------------
  tarnreach: { terrain: "fell", icon: "lorc/mountains" , tint: "dusk" },
  "the-lower-tarn": { terrain: "fell", icon: "delapouite/island" , tint: "tide" },
  "the-boathouse": { terrain: "fell", icon: "delapouite/boat-horizon" , tint: "honey" },
  "the-warming-hut": { terrain: "fell", icon: "delapouite/hut" , tint: "ember" },
  "the-stonesetters-hut": { terrain: "fell", icon: "delapouite/stone-pile" , tint: "dusk" },
  "the-morning-slate": { terrain: "fell", icon: "delapouite/abacus", tint: "tide" },
  "marram-bank": { terrain: "flats", icon: "delapouite/reed", tint: "moss" },
  "the-hundred-steps": { terrain: "wood", icon: "lorc/beech", tint: "moss" },
  "blackfell-scar": { terrain: "fell", icon: "delapouite/mountain-cave" , tint: "dusk" },
  "the-brasswork": { terrain: "fell", icon: "lorc/clockwork", tint: "ember" },
  "the-tumblehouse": { terrain: "flats", icon: "delapouite/drum", tint: "berry" },
  "the-quiet-bindery": { terrain: "wood", icon: "delapouite/book-pile", tint: "honey" },
  "the-upper-tarn": { terrain: "fell", icon: "delapouite/mountain-road" , tint: "tide" },
  "windward-steps": { terrain: "fell", icon: "delapouite/3d-stairs" , tint: "moss" },
  "the-cairn-field": { terrain: "fell", icon: "delapouite/stone-stack" , tint: "berry" },
  "coldspring-well": { terrain: "fell", icon: "delapouite/well" , tint: "tide" },
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
  "keeper-tumblehouse": "lorc/raven",
  "keeper-binder": "caro-asercion/barn-owl",
};

/**
 * Every author whose work appears anywhere in the game, sorted by name.
 *
 * Derived from ALL THREE maps rather than the items alone. The credits
 * page once built its list from `ITEM_ICON_MAP` only, while rendering
 * borrowed place and keeper silhouettes — so an author who contributed a
 * place icon and no item icon would have gone uncredited, which CC BY
 * does not permit. Deriving it here, once, is what makes that
 * unrepeatable, and a test pins it.
 */
export function creditedAuthors(): { name: string; url: string | null }[] {
  const icons = [
    ...Object.values(ITEM_ICON_MAP),
    ...Object.values(PLACE_ICON_MAP).map((place) => place.icon),
    ...Object.values(KEEPER_ICON_MAP),
  ];
  return [...new Set(icons.map((icon) => icon.split("/")[0]))]
    .filter((author): author is string => Boolean(author))
    .map((author) => ICON_AUTHORS[author])
    .filter((entry) => entry !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
}

