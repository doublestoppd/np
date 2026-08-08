import type { RandomEventDefinition } from "../types";

/**
 * Flavour: the grove being itself at you.
 *
 * Several of these are route-gated, which is the whole point — a bridge
 * that creaks only when you are standing on the bridge is worth writing;
 * one that creaks on the inventory screen is noise. Most produce nothing
 * at all, deliberately: if every event paid out, the payout would become
 * the reason to read them.
 */
export const placeEvents: RandomEventDefinition[] = [
  {
    key: "the-hat-incident",
    title: "The hat incident",
    message:
      "A gust takes someone's hat clean off. It travels forty feet, lands in a hedge, and is retrieved with enormous dignity by a stranger who does not own it.",
    weight: 700,
    enabled: true,
    category: "mishap",
    rarity: "common",
    effects: [{ kind: "flavor" }],
  },
  {
    key: "a-frog-judges-you",
    title: "Judged",
    message:
      "A frog on a stone regards you steadily for some time, decides something about you, and returns to the water without sharing it.",
    weight: 600,
    enabled: true,
    category: "mishap",
    rarity: "common",
    effects: [{ kind: "flavor" }],
  },
  {
    key: "out-negotiated",
    title: "Out-negotiated",
    message:
      "You spend four minutes haggling with a hedgehog over the price of nothing in particular. The hedgehog wins. Nothing changes hands.",
    weight: 500,
    enabled: true,
    category: "mishap",
    rarity: "common",
    eligibility: { routePrefixes: ["/market", "/shops", "/shop"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "bridge-planks-complain",
    title: "The planks have opinions",
    message:
      "The old footbridge creaks under you in a sequence that sounds almost, but not quite, like a sentence. You stop halfway to listen. It does not repeat itself.",
    weight: 500,
    enabled: true,
    category: "place",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/dapplewood/old-footbridge"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "bells-out-of-sequence",
    title: "Out of sequence",
    message:
      "One of the brass bells rings on its own, a full beat before the others, and then pretends it did not.",
    weight: 400,
    enabled: true,
    category: "place",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/dapplewood/brassbell-pavilion"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "the-kitchen-smells-of-cinnamon",
    title: "Taste-tester",
    message:
      "Something in the kitchen has gone right, and the cook wants a second opinion before committing to it. You are handed a slice without being asked.",
    weight: 300,
    enabled: true,
    category: "place",
    rarity: "uncommon",
    eligibility: { routePrefixes: ["/explore/dapplewood/hearth-and-ladle"] },
    effects: [{ kind: "item", slug: "cinnamon-moss-cake", quantity: 1 }],
  },
  {
    key: "toadstool-arithmetic",
    title: "Toadstool arithmetic",
    message:
      "You count the toadstools in the hollow. You get a different number every time, and none of the numbers are wrong.",
    weight: 400,
    enabled: true,
    category: "place",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/dapplewood/toadstool-hollow"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "the-stump-declines-to-comment",
    title: "No comment",
    message:
      "You say something out loud at the listening stump, mostly to see what happens. What happens is a very attentive silence.",
    weight: 450,
    enabled: true,
    category: "place",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/dapplewood/the-listening-stump"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "someone-reshelved-badly",
    title: "Reshelved by somebody",
    message:
      "Three books have been put back in an order that is not alphabetical, not by size, and not random. Somebody meant this. Nobody will admit to it.",
    weight: 400,
    enabled: true,
    category: "place",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/dapplewood/whisperleaf-reading-room"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "the-market-runs-out-of-change",
    title: "Out of change",
    message:
      "The whole market has, simultaneously, run out of small coins. For about ten minutes everyone trades in favours and it works better than usual.",
    weight: 350,
    enabled: true,
    category: "place",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/dapplewood/the-mossy-market"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "a-queue-forms-behind-you",
    title: "A queue, apparently",
    message:
      "You pause to think. Four people join a queue behind you. You were not a queue. You are now, briefly, a queue.",
    weight: 500,
    enabled: true,
    category: "mishap",
    rarity: "common",
    effects: [{ kind: "flavor" }],
  },
  {
    key: "wrong-pocket",
    title: "The wrong pocket",
    message:
      "You find coins in a pocket you have checked forty times. They were not there before. You have decided not to think about this.",
    weight: 300,
    enabled: true,
    category: "discovery",
    rarity: "common",
    effects: [{ kind: "coins", min: 4, max: 14 }],
  },
  {
    key: "the-weather-cannot-decide",
    title: "Undecided",
    message:
      "It rains on one side of the path for about a minute. The other side stays completely dry and does not acknowledge it.",
    weight: 450,
    enabled: true,
    category: "place",
    rarity: "common",
    effects: [{ kind: "flavor" }],
  },
  {
    key: "an-excellent-door",
    title: "An excellent door",
    message:
      "You go through a door that closes behind you with a sound so satisfying that you consider going back and doing it again. You do not. You think about it for the rest of the day.",
    weight: 400,
    enabled: true,
    category: "mishap",
    rarity: "common",
    effects: [{ kind: "flavor" }],
  },
  {
    key: "the-lost-thing-is-not-yours",
    title: "Not yours",
    message:
      "Somebody has pinned a note to a tree describing something they lost. The description is so fond and so specific that you spend a while hoping they find it.",
    weight: 350,
    enabled: true,
    category: "place",
    rarity: "common",
    effects: [{ kind: "flavor" }],
  },
];
