import { INSEPARABLE_BOND, type TrophyFacts } from "./facts";

/**
 * Every trophy in the game (ADR-65).
 *
 * A trophy is a name, a sentence saying exactly what it takes, and a pure
 * predicate over `TrophyFacts`. Nothing else: no coins, no items, no
 * unlocks. They are recognition, and recognition is all they are — a
 * trophy that paid would turn "play what you like" into "play what pays",
 * which is the thing docs/design-philosophy.md exists to prevent.
 *
 * **They are meant to be hard.** Most of these are weeks of ordinary
 * play, and a few are a real test of the activity they belong to. That is
 * the point: a trophy you get for turning up says nothing, and a case
 * full of them says nothing loudly.
 *
 * **Nothing here expires and nothing is missable.** Every criterion is a
 * running total or a personal best, so a month away costs a player
 * position in exactly nothing. There is no streak in this file on
 * purpose — a streak is a punishment for having a life.
 *
 * **The `criteria` sentence is shown to the player**, earned or not, on
 * their own profile and on anybody else's. It is the honest version, not
 * a riddle: being told what a trophy takes is what lets somebody decide
 * they do not care about it, which they are entitled to do.
 */
export interface Trophy {
  /** Stable. Stored on PlayerTrophy rows; renaming one orphans them. */
  key: string;
  name: string;
  /** What it takes, in one sentence, in the player's language. */
  criteria: string;
  /** The activity it belongs to, for grouping. */
  group: TrophyGroup;
  /** Emoji, in the same spirit as the activity directory's icons. */
  icon: string;
  earned: (facts: TrophyFacts) => boolean;
}

export type TrophyGroup =
  | "daily"
  | "gathering"
  | "puzzles"
  | "nerve"
  | "arcade"
  | "community"
  | "companions";

export const TROPHY_GROUP_NAMES: Record<TrophyGroup, string> = {
  daily: "The daily round",
  gathering: "Gathering",
  puzzles: "Puzzles",
  nerve: "Nerve and chance",
  arcade: "The arcade",
  community: "Trade and neighbours",
  companions: "Companions and home",
};

/** Order matters: it is the order they appear in, everywhere. */
export const TROPHIES: readonly Trophy[] = [
  // ---------------------------------------------------------------- daily
  {
    key: "word-thirty-mornings",
    name: "Thirty Mornings",
    criteria: "Solve the daily word thirty times.",
    group: "daily",
    icon: "📜",
    earned: (f) => f.wordSolved >= 30,
  },
  {
    key: "word-sharp",
    name: "Sharp Before Breakfast",
    criteria: "Solve the daily word in two guesses or fewer, five times.",
    group: "daily",
    icon: "✒️",
    earned: (f) => f.wordSolvedSharp >= 5,
  },
  {
    key: "wheel-well-turned",
    name: "Well Turned",
    criteria: "Take fifty spins of the prize wheel.",
    group: "daily",
    icon: "🎡",
    earned: (f) => f.wheelSpins >= 50,
  },
  {
    key: "meal-never-hungry",
    name: "Never Goes Hungry",
    criteria: "Claim the community meal forty times.",
    group: "daily",
    icon: "🍲",
    earned: (f) => f.mealsClaimed >= 40,
  },
  {
    key: "drink-the-usual",
    name: "The Usual",
    criteria: "Take a free drink at the hut forty times.",
    group: "daily",
    icon: "🍵",
    earned: (f) => f.drinksClaimed >= 40,
  },
  {
    key: "lantern-lamplighter",
    name: "Lamplighter",
    criteria: "Find the wandering lantern twenty-five times.",
    group: "daily",
    icon: "🏮",
    earned: (f) => f.lanternsFound >= 25,
  },

  // ------------------------------------------------------------ gathering
  {
    key: "forage-full-hands",
    name: "Full Hands",
    criteria: "Bring something back from a forage spot two hundred times.",
    group: "gathering",
    icon: "🧺",
    earned: (f) => f.forageFinds >= 200,
  },
  {
    key: "fishing-broad-net",
    name: "A Broad Net",
    criteria: "Land twelve different kinds of fish.",
    group: "gathering",
    icon: "🎣",
    earned: (f) => f.fishKinds >= 12,
  },

  // -------------------------------------------------------------- puzzles
  {
    key: "sudoku-clean-grid",
    name: "Clean Grid",
    criteria: "Solve thirty daily grids.",
    group: "puzzles",
    icon: "🔢",
    earned: (f) => f.sudokuSolved >= 30,
  },
  {
    key: "sudoku-not-one-check",
    name: "Not One Check",
    criteria: "Solve five grids without checking your work once.",
    group: "puzzles",
    icon: "🖊️",
    earned: (f) => f.sudokuSolvedClean >= 5,
  },
  {
    key: "matching-deep-water",
    name: "Deep Water",
    criteria: "Complete the deep board twenty-five times.",
    group: "puzzles",
    icon: "🃏",
    earned: (f) => f.matchingDeepCompleted >= 25,
  },
  {
    key: "sorting-cellar-hand",
    name: "The Cellar Hand",
    criteria: "Finish forty boards at the sorting bench.",
    group: "puzzles",
    icon: "🗄️",
    earned: (f) => f.sortingCompleted >= 40,
  },

  // ---------------------------------------------------------------- nerve
  {
    key: "cave-all-the-way-down",
    name: "All the Way Down",
    criteria: "Reach the bottom of the Sunken Stair twenty times.",
    group: "nerve",
    icon: "🕯️",
    earned: (f) => f.caveCleared >= 20,
  },
  {
    key: "scratch-against-the-odds",
    name: "Against the Odds",
    criteria: "Win on forty salt chits.",
    group: "nerve",
    icon: "🎟️",
    earned: (f) => f.scratchWins >= 40,
  },
  {
    key: "slots-three-alike",
    name: "Three of a Kind",
    criteria: "Win forty spins at the machine.",
    group: "nerve",
    icon: "🎰",
    earned: (f) => f.slotWins >= 40,
  },

  // --------------------------------------------------------------- arcade
  {
    key: "arcade-long-flight",
    name: "The Long Flight",
    criteria: "Get a paper bird past forty walls in one flight.",
    group: "arcade",
    icon: "🪁",
    earned: (f) => f.bestPaperBird >= 40,
  },
  {
    key: "arcade-top-of-the-beech",
    name: "Top of the Beech",
    criteria: "Reach the fortieth branch in one climb.",
    group: "arcade",
    icon: "🌳",
    earned: (f) => f.bestTreeClimb >= 40,
  },
  {
    key: "arcade-through-the-marram",
    name: "Through the Marram",
    criteria: "Find forty apples in one go at the long grass.",
    group: "arcade",
    icon: "🌾",
    earned: (f) => f.bestSnake >= 40,
  },

  // ------------------------------------------------------------ community
  {
    key: "requests-good-for-it",
    name: "Good For It",
    criteria: "Complete sixty requests from the notice boards.",
    group: "community",
    icon: "📋",
    earned: (f) => f.requestsCompleted >= 60,
  },
  {
    key: "shop-open-for-business",
    name: "Open For Business",
    criteria: "Sell fifty items from your own shop.",
    group: "community",
    icon: "🏪",
    earned: (f) => f.shopSales >= 50,
  },
  {
    key: "shop-regular-customer",
    name: "Regular Customer",
    criteria: "Buy a hundred items from the counters around the world.",
    group: "community",
    icon: "🛍️",
    earned: (f) => f.npcPurchases >= 100,
  },
  {
    key: "giveaway-left-for-somebody",
    name: "Left For Somebody",
    criteria: "Leave fifty things on the communal shelf.",
    group: "community",
    icon: "🎁",
    earned: (f) => f.giveawaysLeft >= 50,
  },

  // ----------------------------------------------------------- companions
  {
    key: "pet-inseparable",
    name: "Inseparable",
    criteria: "Bring a companion's bond to the highest it goes.",
    group: "companions",
    icon: "💞",
    earned: (f) => f.bestBond >= INSEPARABLE_BOND,
  },
  {
    key: "pet-physician",
    name: "Sound Again",
    criteria: "Treat twenty-five ailments.",
    group: "companions",
    icon: "🌿",
    earned: (f) => f.ailmentsTreated >= 25,
  },
  {
    key: "pet-well-read",
    name: "Well Read",
    criteria: "Read twenty different books to your companions.",
    group: "companions",
    icon: "📚",
    earned: (f) => f.booksRead >= 20,
  },
  {
    key: "pet-knows-what-they-like",
    name: "Knows What They Like",
    criteria: "Discover fifteen foods a companion delights in.",
    group: "companions",
    icon: "🍯",
    earned: (f) => f.delightsFound >= 15,
  },
  {
    key: "hollow-a-place-of-your-own",
    name: "A Place Of Your Own",
    criteria: "Plant twenty-five furnishings in your Hollow.",
    group: "companions",
    icon: "🏡",
    earned: (f) => f.hollowPlacements >= 25,
  },
];

const BY_KEY = new Map(TROPHIES.map((trophy) => [trophy.key, trophy]));

/** The trophy with this key, or undefined if it has been retired. */
export function trophyFor(key: string): Trophy | undefined {
  return BY_KEY.get(key);
}
