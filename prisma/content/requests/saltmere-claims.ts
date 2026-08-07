import type { RequestBoardContent } from "../schemas";

/**
 * The second request board: notices pinned behind the Found Counter.
 *
 * Hearth and Ladle's board asks for supplies — *we need things, bring
 * them*. This one is its inverse: people describing something they lost,
 * in case it turns up. Same mechanic, opposite emotional direction, which
 * is why the region gets a board rather than a second kitchen.
 *
 * Every requirement below is a Saltmere lost-property item that appears
 * only in the two foraging pools and in NO shop pool anywhere, so its NPC
 * purchase cost is null and there is no arbitrage route by construction —
 * ADR-25's rule, satisfied by a forage supply rather than the daily meal.
 * Content validation enforces exactly this, so it cannot rot.
 *
 * Nothing expires and nothing is replaced while you wait. Reaching the
 * daily cap defers work to tomorrow and takes nothing away.
 */
export const foundCounterClaimsBoard = {
  key: "found-counter-claims",
  name: "The Claims Board",
  description:
    "Notices from people who lost something and would like it back. The counter takes no view on the odds.",
  active: true,
  dailyCompletionLimit: 3,
  requests: [
    {
      slug: "the-matching-boot",
      sequencePosition: 0,
      title: "The Matching Boot",
      flavorText:
        "Somebody is very close to a pair. They have been very close for two years.",
      requirements: [{ itemSlug: "one-left-boot", quantity: 2 }],
      rewardCoins: 38n,
      active: true,
    },
    {
      slug: "the-tag-without-a-name",
      sequencePosition: 1,
      title: "The Tag Without a Name",
      flavorText:
        "Someone is working out which case was theirs. Every tag helps. None of them have helped yet.",
      requirements: [{ itemSlug: "waterlogged-luggage-tag", quantity: 2 }],
      rewardCoins: 40n,
      active: true,
    },
    {
      slug: "a-pair-at-last",
      sequencePosition: 2,
      title: "A Pair, At Last",
      flavorText:
        "Three boots have been offered. The problem has not improved, but it has become more interesting.",
      requirements: [{ itemSlug: "one-left-boot", quantity: 3 }],
      rewardCoins: 48n,
      active: true,
    },
    {
      slug: "the-drawer-of-odd-things",
      sequencePosition: 3,
      title: "The Drawer of Odd Things",
      flavorText:
        "The counter keeps one drawer for items nobody has described well enough to claim. It is filling up.",
      requirements: [
        { itemSlug: "one-left-boot", quantity: 1 },
        { itemSlug: "chipped-enamel-mug", quantity: 1 },
        { itemSlug: "waterlogged-luggage-tag", quantity: 1 },
      ],
      // Assembling three different things pays better than three of one
      // (ADR-35): the harder card is the better card.
      rewardCoins: 64n,
      active: true,
    },
    {
      slug: "mugs-for-the-drying-sheds",
      sequencePosition: 4,
      title: "Mugs, For the Sheds",
      flavorText:
        "The drying sheds have four mugs and eleven rakers. The arithmetic has become tense.",
      requirements: [{ itemSlug: "chipped-enamel-mug", quantity: 3 }],
      rewardCoins: 58n,
      active: true,
    },
    {
      slug: "the-hinge-and-the-tag",
      sequencePosition: 5,
      title: "The Hinge and the Tag",
      flavorText:
        "Two notices, one handwriting, filed a decade apart. Nobody at the counter has mentioned it.",
      requirements: [
        { itemSlug: "bent-brass-hinge", quantity: 1 },
        { itemSlug: "waterlogged-luggage-tag", quantity: 2 },
      ],
      rewardCoins: 82n,
      active: true,
    },
    {
      slug: "a-tally-that-adds-up",
      sequencePosition: 6,
      title: "A Tally That Adds Up",
      flavorText:
        "The season's count is short by a stick. Everyone has an opinion about which stick.",
      requirements: [{ itemSlug: "salt-rakers-tally", quantity: 3 }],
      rewardCoins: 76n,
      active: true,
    },
    {
      slug: "the-sticking-door",
      sequencePosition: 7,
      title: "The Sticking Door",
      flavorText: "The door has been sticking since before the current door.",
      requirements: [{ itemSlug: "bent-brass-hinge", quantity: 2 }],
      rewardCoins: 78n,
      active: true,
    },
    {
      slug: "mugs-and-tallies",
      sequencePosition: 8,
      title: "Mugs and Tallies",
      flavorText:
        "A shed's entire missing inventory, in one notice, in very small writing.",
      requirements: [
        { itemSlug: "chipped-enamel-mug", quantity: 2 },
        { itemSlug: "salt-rakers-tally", quantity: 2 },
      ],
      rewardCoins: 96n,
      active: true,
    },
    {
      slug: "the-whole-shelf",
      sequencePosition: 9,
      title: "The Whole Shelf",
      flavorText:
        "Someone is restocking a workshop from nothing. They have been polite about it, which has not gone unnoticed.",
      requirements: [
        { itemSlug: "salt-rakers-tally", quantity: 2 },
        { itemSlug: "bent-brass-hinge", quantity: 1 },
        { itemSlug: "chipped-enamel-mug", quantity: 1 },
      ],
      rewardCoins: 124n,
      active: true,
    },
  ],
} satisfies RequestBoardContent;
