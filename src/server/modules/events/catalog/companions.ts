import type { RandomEventDefinition } from "../types";

/**
 * Small things a companion does while you are busy elsewhere.
 *
 * Every one of these requires a pet and touches at most a few points of a
 * stat. The one negative delta in the catalog lives here, paired with a
 * larger positive — a companion who tires itself out being delighted is a
 * character note, not a penalty, and there is no way for these to leave a
 * player worse off in any way that matters. Health is never reduced.
 */
export const companionEvents: RandomEventDefinition[] = [
  {
    key: "companion-finds-a-sunbeam",
    title: "A sunbeam, claimed",
    message:
      "{pet} has located the single warmest patch of floor in the grove and is refusing, politely but absolutely, to move from it.",
    weight: 800,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: { requiresPet: true },
    effects: [{ kind: "petStat", stat: "happiness", delta: 6 }],
  },
  {
    key: "an-enthusiastic-nap",
    title: "An enthusiastic nap",
    message:
      "{pet} fell asleep mid-step, upright, for about ninety seconds, and woke up entirely restored and slightly embarrassed.",
    weight: 700,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: { requiresPet: true },
    effects: [{ kind: "petStat", stat: "energy", delta: 8 }],
  },
  {
    key: "cadged-from-a-stranger",
    title: "Shameless",
    message:
      "Someone gave {pet} half a biscuit. {pet} did nothing to earn this and is not sorry.",
    weight: 600,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: { requiresPet: true },
    effects: [{ kind: "petStat", stat: "hunger", delta: 5 }],
  },
  {
    key: "overexcited-about-nothing",
    title: "Overexcited about nothing",
    message:
      "A leaf moved. {pet} has now run four complete laps of the clearing about it and needs a moment.",
    weight: 500,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: { requiresPet: true },
    effects: [
      { kind: "petStat", stat: "happiness", delta: 8 },
      { kind: "petStat", stat: "energy", delta: -6 },
    ],
  },
  {
    key: "a-gift-of-questionable-value",
    title: "A gift",
    message:
      "{pet} presents you with a ribbon. It is slightly damp. The ceremony of the thing makes it impossible to refuse.",
    weight: 350,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: { requiresPet: true },
    effects: [{ kind: "item", slug: "patchwork-ribbon", quantity: 1 }],
  },
  {
    key: "the-considered-puddle",
    title: "A considered puddle",
    message:
      "{pet} has been staring at the same puddle for four minutes. Something has been worked out. You will not be told what.",
    weight: 700,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: { requiresPet: true },
    effects: [{ kind: "petStat", stat: "happiness", delta: 5 }],
  },
  {
    key: "the-wrong-lap",
    title: "The wrong lap",
    message:
      "{pet} has settled confidently onto a total stranger, who is far too polite to say anything and is now stuck there.",
    weight: 550,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: { requiresPet: true },
    effects: [{ kind: "petStat", stat: "happiness", delta: 7 }],
  },
  {
    key: "helping",
    title: "Helping",
    message:
      "{pet} is standing on the exact thing you need, watching you look for it, radiating helpfulness.",
    weight: 600,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: { requiresPet: true },
    effects: [{ kind: "petStat", stat: "happiness", delta: 4 }],
  },
  {
    key: "the-long-way-round",
    title: "The long way round",
    message:
      "There was a direct route. {pet} took the other one, at speed, twice, and arrived at the same time looking extremely pleased.",
    weight: 500,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: { requiresPet: true },
    effects: [
      { kind: "petStat", stat: "happiness", delta: 7 },
      { kind: "petStat", stat: "energy", delta: -5 },
    ],
  },
  {
    key: "supervising-the-water",
    title: "Supervising the water",
    message:
      "{pet} has appointed themself to watch the river. The river is behaving. This is presumably why.",
    weight: 450,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: {
      requiresPet: true,
      routePrefixes: ["/explore/dapplewood/old-footbridge", "/explore/saltmere"],
    },
    effects: [{ kind: "petStat", stat: "happiness", delta: 6 }],
  },
  {
    key: "asleep-in-the-satchel",
    title: "Asleep in the satchel",
    message:
      "You open your satchel to look for something. {pet} is in it. {pet} was not in it a moment ago, and is now deeply asleep.",
    weight: 400,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: { requiresPet: true, routePrefixes: ["/inventory"] },
    effects: [{ kind: "petStat", stat: "energy", delta: 7 }],
  },
  {
    key: "a-second-gift",
    title: "Another gift",
    message:
      "{pet} has brought you a button. It is not from anything you own. The correct response, apparently, is to be delighted, so you are.",
    weight: 250,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: { requiresPet: true },
    effects: [{ kind: "item", slug: "mossy-brass-button", quantity: 1 }],
  },
];
