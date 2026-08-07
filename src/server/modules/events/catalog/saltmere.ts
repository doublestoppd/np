import type { RandomEventDefinition } from "../types";

/**
 * The coast being itself at you.
 *
 * Saltmere had eight locations and not one event of its own, so a player
 * who moved there got a quieter world than the one they left — exactly
 * backwards. Most of these are route-gated to a single place, which is the
 * point: a beacon that only does something odd while you are standing
 * under the beacon is worth writing.
 *
 * The coast is drier and more practical than the grove: fewer marvels,
 * more people who have been doing a job for thirty years and have opinions
 * about how you are holding that rope.
 */
export const saltmereEvents: RandomEventDefinition[] = [
  {
    key: "the-tide-is-early",
    title: "The tide is early",
    message:
      "It is not early. It is exactly on time, and has been for some centuries. But everyone on the landing says it is early, so it is early.",
    weight: 600,
    enabled: true,
    category: "grove",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/saltmere"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "a-rope-opinion",
    title: "An opinion about your knot",
    message:
      "Someone stops, looks at the rope you are not even holding, and reties it. They do not explain. It is, undeniably, a better knot.",
    weight: 500,
    enabled: true,
    category: "mishap",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/saltmere/lowwater-landing"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "the-sheds-in-a-crosswind",
    title: "The sheds in a crosswind",
    message:
      "Four hundred hanging things all turn to face the same way at once, like something has been decided, and then go back to disagreeing.",
    weight: 450,
    enabled: true,
    category: "grove",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/saltmere/the-drying-sheds"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "the-beacon-blinks-wrong",
    title: "Out of rhythm",
    message:
      "The beacon misses a beat, then catches up by going twice as fast, and settles as though nobody saw. Somebody always sees.",
    weight: 400,
    enabled: true,
    category: "grove",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/saltmere/the-quiet-beacon"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "counting-the-steps",
    title: "Counting the steps",
    message:
      "Going down: thirty-one. Coming back up: thirty-one. Everyone agrees on thirty-one. Nobody has ever managed to point at the same thirty-first.",
    weight: 400,
    enabled: true,
    category: "grove",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/saltmere/the-deepwater-steps"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "handed-a-thing-to-hold",
    title: "Handed a thing to hold",
    message:
      "Someone hands you the end of something heavy, says they will be right back, and is. You are thanked with an unreasonable amount of warmth.",
    weight: 350,
    enabled: true,
    category: "grove",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/saltmere/the-mending-yard"] },
    effects: [{ kind: "coins", min: 8, max: 22 }],
  },
  {
    key: "the-wrackline-after-weather",
    title: "After weather",
    message:
      "Whatever came through in the night has left the wrackline rearranged. Everything is in the wrong place, which is to say the tide has filed it differently.",
    weight: 400,
    enabled: true,
    category: "discovery",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/saltmere/the-wrackline"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "the-tin-in-the-shingle",
    title: "The tin in the shingle",
    message:
      "A tin worn smooth on every corner, still shutting properly. Whatever it kept dry, it kept dry for a very long time.",
    weight: 180,
    enabled: true,
    category: "discovery",
    rarity: "uncommon",
    eligibility: { routePrefixes: ["/explore/saltmere"] },
    effects: [{ kind: "item", slug: "tide-worn-tin", quantity: 1 }],
  },
  {
    key: "a-pane-from-the-beacon",
    title: "A pane from the beacon",
    message:
      "Thick glass, ground down at one edge, still faintly greenish. Held up to the light it makes everything look like weather that has not arrived yet.",
    weight: 90,
    enabled: true,
    category: "discovery",
    rarity: "uncommon",
    cooldownMinutes: 720,
    eligibility: { routePrefixes: ["/explore/saltmere"], minAccountAgeHours: 24 },
    effects: [{ kind: "item", slug: "beacon-lamp-glass", quantity: 1 }],
  },
  {
    key: "the-tally-nobody-finished",
    title: "The tally nobody finished",
    message:
      "A salt-raker's tally, notched to a number and then abandoned mid-count. Somebody was interrupted here, a long time ago, and never came back to it.",
    weight: 60,
    enabled: true,
    category: "discovery",
    rarity: "uncommon",
    cooldownMinutes: 1_440,
    eligibility: { routePrefixes: ["/explore/saltmere"], minAccountAgeHours: 72 },
    effects: [{ kind: "item", slug: "salt-rakers-tally", quantity: 1 }],
  },
];
