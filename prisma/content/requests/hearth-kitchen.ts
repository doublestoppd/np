import type { RequestBoardContent } from "../schemas";

/**
 * The first request board: practical kitchen needs posted at Hearth and
 * Ladle. Requirements are drawn from the everyday foods the daily meal
 * hands out, so a request is a way to turn what you already have into
 * coins — never a reason to buy stock from a shop and flip it (none of
 * these items are sold by an NPC, and content validation reports the
 * margin for every request).
 *
 * Requests do not expire, are not replaced while you wait, and missing a
 * day costs nothing: the cap simply defers work to tomorrow.
 */
export const hearthKitchenRequestBoard = {
  key: "hearth-kitchen-requests",
  name: "Community Requests",
  description:
    "The kitchen has posted a few practical needs and one impractical handwriting style.",
  active: true,
  dailyCompletionLimit: 3,
  requests: [
    {
      slug: "biscuit-basket",
      sequencePosition: 0,
      title: "A Basket for the Morning Table",
      flavorText:
        "The basket is present. Its contents have been less cooperative.",
      requirements: [{ itemSlug: "honey-oat-biscuit", quantity: 2 }],
      rewardCoins: 40n,
      active: true,
    },
    {
      slug: "morning-toast-run",
      sequencePosition: 1,
      title: "Toast, Before the Rush",
      flavorText:
        "Someone has written URGENT on the card. The kitchen disputes this.",
      requirements: [{ itemSlug: "berry-jam-toast", quantity: 2 }],
      rewardCoins: 45n,
      active: true,
    },
    {
      slug: "root-cellar-tally",
      sequencePosition: 2,
      title: "The Root Cellar Disagreement",
      flavorText:
        "Two people counted the carrots. Neither result was three.",
      requirements: [{ itemSlug: "roasted-mooncarrot", quantity: 3 }],
      rewardCoins: 50n,
      active: true,
    },
    {
      slug: "scone-diplomacy",
      sequencePosition: 3,
      title: "Scones, For Diplomatic Reasons",
      flavorText: "The dispute is not about scones. The scones help anyway.",
      requirements: [{ itemSlug: "pear-and-thyme-scone", quantity: 2 }],
      rewardCoins: 48n,
      active: true,
    },
    {
      slug: "stew-for-the-late-shift",
      sequencePosition: 4,
      title: "Something Warm for the Late Shift",
      flavorText:
        "They finish after dark and have opinions about cold dinners.",
      requirements: [{ itemSlug: "warm-root-stew", quantity: 2 }],
      rewardCoins: 65n,
      active: true,
    },
    {
      slug: "muffin-arithmetic",
      sequencePosition: 5,
      title: "Muffin Arithmetic",
      flavorText:
        "Three were requested, four were promised, and one has gone missing.",
      requirements: [{ itemSlug: "cloudberry-muffin", quantity: 3 }],
      rewardCoins: 70n,
      active: true,
    },
    {
      slug: "bread-and-patience",
      sequencePosition: 6,
      title: "Bread, and a Little Patience",
      flavorText: "The loaves are for a long meeting. So is the patience.",
      requirements: [{ itemSlug: "herb-flecked-bread", quantity: 3 }],
      rewardCoins: 60n,
      active: true,
    },
    {
      slug: "pie-for-the-doorstop",
      sequencePosition: 7,
      title: "A Pie That Is Not a Doorstop",
      flavorText:
        "The previous pie held a door open for three days. Standards have changed.",
      requirements: [{ itemSlug: "mushroom-hand-pie", quantity: 2 }],
      rewardCoins: 58n,
      active: true,
    },
    {
      slug: "tart-of-record",
      sequencePosition: 8,
      title: "The Tart of Record",
      flavorText:
        "For the archive. The archivist insists this is a legitimate use of the archive.",
      requirements: [{ itemSlug: "apple-clover-tart", quantity: 2 }],
      rewardCoins: 52n,
      active: true,
    },
    {
      slug: "cake-by-committee",
      sequencePosition: 9,
      title: "Cake, Approved by Committee",
      flavorText:
        "It took four meetings to agree on cake. The cake is not to blame.",
      requirements: [{ itemSlug: "cinnamon-moss-cake", quantity: 2 }],
      rewardCoins: 55n,
      active: true,
    },
    {
      slug: "mixed-basket",
      sequencePosition: 10,
      title: "A Basket of Assorted Reassurance",
      flavorText:
        "Nobody would say who it is for. The kitchen has stopped asking.",
      requirements: [
        { itemSlug: "honey-oat-biscuit", quantity: 1 },
        { itemSlug: "berry-jam-toast", quantity: 1 },
        { itemSlug: "roasted-mooncarrot", quantity: 1 },
      ],
      rewardCoins: 58n,
      active: true,
    },
    {
      slug: "the-long-table",
      sequencePosition: 11,
      title: "The Long Table",
      flavorText:
        "Once a season the whole table is set. Nobody remembers deciding this.",
      requirements: [
        { itemSlug: "warm-root-stew", quantity: 1 },
        { itemSlug: "cloudberry-muffin", quantity: 1 },
        { itemSlug: "herb-flecked-bread", quantity: 2 },
      ],
      rewardCoins: 95n,
      active: true,
    },
  ],
} satisfies RequestBoardContent;
