import type { WordAnswersContent } from "../schemas";

/**
 * Ordered daily word answer rotations — the authored source of truth.
 *
 * RULES (prisma/content/README.md):
 * - The array index IS the sequence position. Each difficulty advances by
 *   one answer per global game day (UTC) and wraps after the last active
 *   answer. APPEND new words at the end; never insert or reorder existing
 *   entries — that renumbers every later position and is only acceptable
 *   during pre-alpha together with a full database reset.
 * - To retire a word without shifting positions, replace the bare string
 *   with { word: "MOSS", active: false } — rotation skips it, existing
 *   puzzles keep it.
 * - Answers are curated real words: ordinary enough to solve, suited to
 *   the game's tone, no proper nouns, abbreviations, slurs, punctuation.
 * - Lengths are fixed per difficulty: EASY 4, MEDIUM 5, HARD 6.
 */
export const wordAnswers = {
  EASY: [
  // 0-9
  "MOSS", "FERN", "GLOW", "MIST", "WISP", "BARK", "STAR", "CAVE", "POND", "TOAD",
  // 10-19
  "RUNE", "DUSK", "LEAF", "TREE", "ROOT", "SEED", "VINE", "REED", "PINE", "ROSE",
  // 20-29
  "LILY", "HERB", "WOOD", "DAWN", "RAIN", "SNOW", "WIND", "WAVE", "TIDE", "LAKE",
  // 30-39
  "COVE", "HILL", "VALE", "PATH", "GLEN", "MOOR", "PEAK", "DELL", "BIRD", "WREN",
  // 40-49
  "DOVE", "HARE", "DEER", "FAWN", "MOLE", "FROG", "NEWT", "FISH", "MOTH", "WORM",
  // 50-59
  "BEAR", "WOLF", "CRAB", "CLAM", "DUCK", "SWAN", "CROW", "LARK", "PEAR", "PLUM",
  // 60-69
  "MINT", "SAGE", "CORN", "OATS", "RICE", "MILK", "CAKE", "TART", "SOUP", "STEW",
  // 70-79
  "BREW", "LAMP", "BELL", "BOOK", "PAGE", "YARN", "WOOL", "SILK", "ROPE", "KNOT",
  // 80-89
  "BOAT", "RAFT", "OARS", "SAIL", "KITE", "DRUM", "HARP", "HORN", "MOON", "NOON",
  // 90-99
  "GUST", "SONG", "TUNE", "TALE", "MYTH", "LORE", "GIFT", "GOLD", "WARM", "NEST",
  ],
  MEDIUM: [
  // 0-9
  "BRIAR", "GLADE", "CHARM", "HONEY", "RIVER", "BLOOM", "LIGHT", "SPARK", "PEARL", "CLOUD",
  // 10-19
  "STONE", "GROVE", "AMBER", "APPLE", "BERRY", "BIRCH", "BREAD", "BROOK", "CEDAR", "CIDER",
  // 20-29
  "CORAL", "CREEK", "CRUMB", "DAISY", "DREAM", "DRIFT", "EMBER", "FABLE", "FEAST", "FIELD",
  // 30-39
  "FLAME", "FLOCK", "FROST", "GLEAM", "GRAIN", "GRASS", "HAZEL", "HEART", "HEATH", "HOLLY",
  // 40-49
  "LEMON", "LILAC", "MAPLE", "MARSH", "MELON", "MERRY", "MIRTH", "MOUSE", "MUSIC", "NIGHT",
  // 50-59
  "NORTH", "OCEAN", "OLIVE", "OTTER", "PEACH", "PETAL", "PLUME", "POPPY", "QUAIL", "QUIET",
  // 60-69
  "QUILT", "RAVEN", "RIDGE", "ROBIN", "ROOST", "SHADE", "SHEEP", "SHELL", "SHINE", "SHORE",
  // 70-79
  "SLEEP", "SMILE", "SNAIL", "SPICE", "SPIRE", "SPOUT", "STORM", "STRAW", "SUNNY", "SWEET",
  // 80-89
  "THYME", "TOAST", "TORCH", "TRAIL", "TROUT", "TULIP", "TWINE", "VERSE", "WAGON", "WATER",
  // 90-99
  "WHEAT", "WINGS", "WOODS", "CABIN", "CANDY", "CHIME", "COMET", "DANCE", "EAGLE", "FANCY",
  ],
  HARD: [
  // 0-9
  "FOREST", "MEADOW", "WILLOW", "GARDEN", "SPIRIT", "EMBERS", "BREEZE", "ACORNS", "PETALS", "CANDLE",
  // 10-19
  "FABLES", "VELVET", "ANTLER", "AUTUMN", "BADGER", "BALLAD", "BANNER", "BASKET", "BEACON", "BOTTLE",
  // 20-29
  "BRANCH", "BRIDGE", "BUCKET", "BURROW", "BUTTER", "CANOPY", "CASTLE", "CAVERN", "CELLAR", "CHERRY",
  // 30-39
  "CLOVER", "COBBLE", "COCOON", "COPPER", "COTTON", "CRADLE", "DAPPLE", "DAZZLE", "FIDDLE", "FLOWER",
  // 40-49
  "FROLIC", "GALLOP", "GINGER", "GOBLET", "GOLDEN", "GROTTO", "HAMLET", "HARBOR", "HAMMER", "HOLLOW",
  // 50-59
  "KETTLE", "KITTEN", "LAGOON", "LEGEND", "LICHEN", "LOCKET", "MANTLE", "MARBLE", "MARKET", "MELLOW",
  // 60-69
  "MELODY", "MITTEN", "MORSEL", "MUFFIN", "NECTAR", "NESTLE", "NUTMEG", "ORCHID", "PANTRY", "PARLOR",
  // 70-79
  "PEBBLE", "PIGLET", "PILLOW", "POLLEN", "POTION", "PUDDLE", "QUAINT", "QUIVER", "RABBIT", "RADISH",
  // 80-89
  "RAMBLE", "RIBBON", "RIDDLE", "RIPPLE", "RUSTIC", "SADDLE", "SALMON", "SEASON", "SHADOW", "SILVER",
  // 90-99
  "SPRING", "SPROUT", "SQUASH", "STREAM", "SUMMER", "SUNSET", "TEAPOT", "TIMBER", "TINDER", "WONDER",
  ],
} satisfies WordAnswersContent;
