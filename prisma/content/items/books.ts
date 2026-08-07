import type { BookContent, ItemContent } from "../schemas";

/**
 * Books, to be read aloud to a companion (ADR-50).
 *
 * A book is consumed by reading it, which sounds harsh until you notice
 * what it buys: the pet keeps the title on its shelf forever, and the
 * shelf is the point. You are not stockpiling books, you are building a
 * record of evenings.
 *
 * Rarity here means *scarcity*, not quality. The Bee Book is a perfectly
 * good book. It is simply everywhere, and a companion that has already
 * heard about bees is not going to be much changed by hearing about them
 * again — which is exactly what the insight numbers say.
 *
 * Every title is a real book somebody in this world could plausibly have
 * written, with a subject and a tone. None of them are "Tome of +4
 * Wisdom": a book whose only property is its tier is not a book.
 */
export const bookItems = [
  // ---- Everywhere ---------------------------------------------------
  {
    slug: "a-short-account-of-weather",
    name: "A Short Account of Weather",
    description:
      "Forty pages, most of them about rain. The final chapter concedes that the author has not been anywhere with much else.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "keepsake"],
    price: 30n,
    rarity: "COMMON",
    artKey: "a-short-account-of-weather",
  },
  {
    slug: "knots-for-the-impatient",
    name: "Knots for the Impatient",
    description:
      "Six knots, each shown in three steps. The introduction is a short and unmistakably bitter note about people who use nine.",
    type: "BOOK",
    category: "books",
    tags: ["bound"],
    price: 34n,
    rarity: "COMMON",
    artKey: "knots-for-the-impatient",
  },
  {
    slug: "two-hundred-uses-for-moss",
    name: "Two Hundred Uses for Moss",
    description:
      "There are a hundred and six uses for moss. The author was aware of this and has said so in the preface, at length.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "woodland"],
    price: 38n,
    rarity: "COMMON",
    artKey: "two-hundred-uses-for-moss",
  },
  {
    slug: "the-bee-book",
    name: "The Bee Book",
    description:
      "Everything about bees, illustrated in fine detail by somebody who was clearly stung repeatedly during the work and did not stop.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "woodland"],
    price: 44n,
    rarity: "COMMON",
    artKey: "the-bee-book",
  },
  {
    slug: "on-walking-slowly",
    name: "On Walking Slowly",
    description:
      "A defence of arriving late, argued so patiently that it takes rather longer to read than the walk it describes.",
    type: "BOOK",
    category: "books",
    tags: ["bound"],
    price: 48n,
    rarity: "COMMON",
    artKey: "on-walking-slowly",
  },
  {
    slug: "a-cooks-notes-on-roots",
    name: "A Cook's Notes on Roots",
    description:
      "Stained through, corners soft, and worth more for the margins than the recipes. Somebody has written NO beside the parsnips.",
    type: "BOOK",
    category: "books",
    tags: ["bound"],
    price: 55n,
    rarity: "COMMON",
    artKey: "a-cooks-notes-on-roots",
  },
  {
    slug: "small-repairs",
    name: "Small Repairs",
    description:
      "How to mend eleven things. The twelfth chapter is titled WHEN TO STOP MENDING IT and is two pages long.",
    type: "BOOK",
    category: "books",
    tags: ["bound"],
    price: 62n,
    rarity: "COMMON",
    artKey: "small-repairs",
  },
  {
    slug: "where-the-road-goes-abridged",
    name: "Where the Road Goes (Abridged)",
    description:
      "The unabridged edition is said to run to four volumes. This one gets there by the second chapter and spends the rest apologising.",
    type: "BOOK",
    category: "books",
    tags: ["bound"],
    price: 70n,
    rarity: "COMMON",
    artKey: "where-the-road-goes-abridged",
  },

  // ---- Harder to come by ---------------------------------------------
  {
    slug: "the-tidewatchers-almanac",
    name: "The Tidewatcher's Almanac",
    description:
      "Tables, and beneath the tables, weather notes going back sixty years in four different hands. The last hand stops mid-year.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "tidal"],
    price: 130n,
    rarity: "UNCOMMON",
    artKey: "the-tidewatchers-almanac",
  },
  {
    slug: "names-for-rain",
    name: "Names for Rain",
    description:
      "Ninety-one of them, collected across three regions, with a note on which ones are only used by people being unkind about somewhere else.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "keepsake"],
    price: 155n,
    rarity: "UNCOMMON",
    artKey: "names-for-rain",
  },
  {
    slug: "bridges-i-have-crossed",
    name: "Bridges I Have Crossed",
    description:
      "A memoir organised entirely by bridge. It is a much better book than that description suggests and the author knew it.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "keepsake"],
    price: 180n,
    rarity: "UNCOMMON",
    artKey: "bridges-i-have-crossed",
  },
  {
    slug: "a-field-guide-to-things-that-are-not-there",
    name: "A Field Guide to Things That Are Not There",
    description:
      "Illustrated throughout. Each plate is technically accomplished and technically blank, and the captions are entirely serious.",
    type: "BOOK",
    category: "books",
    tags: ["bound"],
    price: 205n,
    rarity: "UNCOMMON",
    artKey: "a-field-guide-to-things-that-are-not-there",
  },
  {
    slug: "the-lamplighters-round",
    name: "The Lamplighter's Round",
    description:
      "One night's walk, lamp by lamp, in the order they are lit. Read aloud it takes about as long as the round itself.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "lit"],
    price: 230n,
    rarity: "UNCOMMON",
    artKey: "the-lamplighters-round",
  },
  {
    slug: "nine-ways-to-sit-still",
    name: "Nine Ways to Sit Still",
    description:
      "Eight of them are variations on the first. The ninth is a single sentence and is generally agreed to be the whole book.",
    type: "BOOK",
    category: "books",
    tags: ["bound"],
    price: 260n,
    rarity: "UNCOMMON",
    artKey: "nine-ways-to-sit-still",
  },

  // ---- Genuinely scarce ----------------------------------------------
  {
    slug: "the-deepwater-register",
    name: "The Deepwater Register",
    description:
      "Every sounding ever taken in the upper tarn, none of which found the bottom. The columns for depth are all the same and all wrong.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "freshwater"],
    price: 620n,
    rarity: "RARE",
    artKey: "the-deepwater-register",
  },
  {
    slug: "letters-to-a-cartographer",
    name: "Letters to a Cartographer",
    description:
      "One side of a correspondence lasting thirty years. The replies are missing and the letters get steadily fonder without them.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "keepsake"],
    price: 780n,
    rarity: "RARE",
    artKey: "letters-to-a-cartographer",
  },
  {
    slug: "an-inventory-of-lost-bells",
    name: "An Inventory of Lost Bells",
    description:
      "Where each one hung, what it weighed, and the last day anybody heard it. Compiled by a person who plainly went to look.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "metal"],
    price: 950n,
    rarity: "RARE",
    artKey: "an-inventory-of-lost-bells",
  },
  {
    slug: "the-long-winter-ledger",
    name: "The Long Winter Ledger",
    description:
      "Accounts kept through a winter nobody expected to survive, in handwriting that gets smaller as the paper runs out and steadier as it does.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "keepsake"],
    price: 1_200n,
    rarity: "RARE",
    artKey: "the-long-winter-ledger",
  },

  // ---- Almost nobody has one -----------------------------------------
  {
    slug: "the-book-of-doors",
    name: "The Book of Doors That Open Onto Nothing",
    description:
      "Two hundred doors, each drawn from life, each opening onto a blank wall. The index is alphabetical by what the wall is made of.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "keepsake"],
    price: 3_500n,
    rarity: "ULTRA_RARE",
    artKey: "the-book-of-doors",
    stackable: false,
    provenancePolicy: "ORIGINAL_SOURCE",
  },
  {
    slug: "the-unbound-folio",
    name: "The Unbound Folio",
    description:
      "Loose sheets in a wrap of oilcloth, never sewn, in an order nobody has satisfactorily established. Read it twice and it is a different book.",
    type: "BOOK",
    category: "books",
    tags: ["bound", "keepsake"],
    price: 7_500n,
    rarity: "ULTRA_RARE",
    artKey: "the-unbound-folio",
    stackable: false,
    provenancePolicy: "FULL_HISTORY",
  },
] satisfies ItemContent[];

/**
 * What each title is worth to a companion the first time it hears it.
 *
 * The numbers rise with scarcity, but nothing like as steeply as price
 * does: the black folio costs 250 times what the weather book does and is
 * worth 14 times as much insight. That gap is deliberate. Reading twenty
 * cheap books to your companion is a better use of coins than chasing one
 * expensive one, and it is also a nicer thing to do — which is the
 * ordering the game should reward.
 */
export const books = [
  { itemSlug: "a-short-account-of-weather", insight: 6, author: "Perrin Dask" },
  { itemSlug: "knots-for-the-impatient", insight: 6, author: "A. Furlong" },
  { itemSlug: "two-hundred-uses-for-moss", insight: 7, author: "Hesper Vane" },
  { itemSlug: "the-bee-book", insight: 7, author: "Orla Combe" },
  { itemSlug: "on-walking-slowly", insight: 8, author: "Tobin Rell" },
  { itemSlug: "a-cooks-notes-on-roots", insight: 8, author: "unattributed" },
  { itemSlug: "small-repairs", insight: 9, author: "Mattias Kell" },
  { itemSlug: "where-the-road-goes-abridged", insight: 10, author: "Ines Marrow" },

  { itemSlug: "the-tidewatchers-almanac", insight: 16, author: "four hands" },
  { itemSlug: "names-for-rain", insight: 17, author: "Sabel Ash" },
  { itemSlug: "bridges-i-have-crossed", insight: 18, author: "Corwen Fitch" },
  {
    itemSlug: "a-field-guide-to-things-that-are-not-there",
    insight: 20,
    author: "Ambrose Lea",
  },
  { itemSlug: "the-lamplighters-round", insight: 21, author: "Nell Quist" },
  { itemSlug: "nine-ways-to-sit-still", insight: 22, author: "Bekan Doe" },

  { itemSlug: "the-deepwater-register", insight: 38, author: "the tarn wardens" },
  { itemSlug: "letters-to-a-cartographer", insight: 41, author: "M. to J." },
  { itemSlug: "an-inventory-of-lost-bells", insight: 44, author: "Wren Halloway" },
  { itemSlug: "the-long-winter-ledger", insight: 46, author: "unattributed" },

  { itemSlug: "the-book-of-doors", insight: 85, author: "Ambrose Lea" },
  { itemSlug: "the-unbound-folio", insight: 110, author: "nobody agrees" },
] satisfies BookContent[];
