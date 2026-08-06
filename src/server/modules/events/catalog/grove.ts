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
export const groveEvents: RandomEventDefinition[] = [
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
    category: "grove",
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
    category: "grove",
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
    category: "grove",
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
    category: "grove",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/dapplewood/toadstool-hollow"] },
    effects: [{ kind: "flavor" }],
  },
];
