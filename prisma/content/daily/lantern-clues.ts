import type { LanternCluesContent } from "../schemas";

/**
 * Where the lantern can hide, and the riddle left behind at the beacon.
 *
 * RULES (prisma/content/README.md):
 * - One entry per PUBLISHED location. Validation fails the build if a
 *   published location has no clue, because a place with no riddle is a
 *   place the hunt can never send anyone — the world would quietly get
 *   smaller every time somebody added a location and forgot this file.
 * - `locationRef` is "regionSlug/locationSlug"; location slugs are only
 *   unique within their region.
 * - A clue must be SOLVABLE by someone who has read the location's own
 *   description, and must not name the place or its region. The game is
 *   deduction, not a coin toss — three blind looks over fifteen places
 *   would be a lottery wearing a riddle's hat.
 * - Voice: the lantern's own, dry and faintly unhelpful, matching the
 *   world copy in prisma/content/world/. It is an object with opinions,
 *   not a character with a schedule — there is no NPC here to simulate.
 * - `active: false` retires a riddle without deleting it: the lantern
 *   stops hiding there and existing hunts keep their frozen reference.
 */
export const lanternClues = [
  // ── Dapplewood ────────────────────────────────────────────────────────
  {
    locationRef: "dapplewood/mosslight-clearing",
    clue: "Somewhere that manages to glow perfectly well without me, which I have decided not to take personally. Ask the squirrel. The squirrel will not help.",
  },
  {
    locationRef: "dapplewood/old-footbridge",
    clue: "Over the water without being in it, at the one place where leaning on a rail all afternoon counts as having done something.",
  },
  {
    locationRef: "dapplewood/toadstool-hollow",
    clue: "Down where it is dim and crowded and every single neighbour has a wide hat and a strong opinion underneath it.",
  },
  {
    locationRef: "dapplewood/beechrow-physic-garden",
    clue: "Among the labelled rows, between something for a cough and something for a sulk. I am not, whatever the tortoise says, one of the exhibits.",
  },
  {
    locationRef: "dapplewood/tanglestile-green",
    clue: "Where four paths give up arguing. Look on the stile that leans, at the end away from the counter.",
  },
  {
    locationRef: "dapplewood/the-hundred-steps",
    clue: "Up something very old, on a foothold somebody hammered in a long time ago and never came back to explain.",
  },
  {
    locationRef: "dapplewood/the-listening-stump",
    clue: "I told something very large exactly where I was going. It has not passed the message on. It never does.",
  },
  {
    locationRef: "dapplewood/whisperleaf-reading-room",
    clue: "Hidden in plain sight — which is apparently educational when the librarian does it, and mischief when I do.",
  },
  {
    locationRef: "dapplewood/the-quiet-bindery",
    clue: "Among presses and thread and a great deal of paper dust, where the proprietor would rather you read the stock aloud than shelve it.",
  },
  {
    locationRef: "dapplewood/brassbell-pavilion",
    clue: "Beside something round and painted that has been certified entirely fair by the person who owns it.",
  },
  {
    locationRef: "dapplewood/hearth-and-ladle",
    clue: "Where everybody gets one and nobody gets two, and the question of why is still open after all these years.",
  },

  // ── Saltmere ──────────────────────────────────────────────────────────
  {
    locationRef: "saltmere/lowwater-landing",
    clue: "Down the green stone, among boats that spend half of every day sitting in mud and have made their peace with it.",
  },
  {
    locationRef: "saltmere/the-wrackline",
    clue: "On the long untidy line of everything the water declined to keep. Turn at the boot. Everyone turns at the boot.",
  },
  {
    locationRef: "saltmere/the-drying-sheds",
    clue: "Under a long white roof, beside ridges you are asked not to walk on — not for the ridges' sake, you understand.",
  },
  {
    locationRef: "saltmere/the-tumblehouse",
    clue: "Behind three drums and a lever that takes two hands, at the one counter in the marsh that will not change your money back.",
  },
  {
    locationRef: "saltmere/the-salt-larder",
    clue: "Shuttered up high among provisions in no hurry whatsoever. Nothing in that room needs eating today, myself included.",
  },
  {
    locationRef: "saltmere/the-found-counter",
    clue: "Among things that have already been found once, each wearing a paper tag saying where it turned up. Mine would be cheating, so I left it off.",
  },
  {
    locationRef: "saltmere/the-mending-yard",
    clue: "Where everything is halfway to being fixed, near a chair repaired far more often than it has ever been sat in.",
  },
  {
    locationRef: "saltmere/the-quiet-beacon",
    clue: "I did not go anywhere at all. I am precisely where this note is, which is the one place nobody thinks to look.",
  },

  // ── Tarnreach ─────────────────────────────────────────────────────────
  {
    locationRef: "tarnreach/the-lower-tarn",
    clue: "Beside black water in a bowl of loose stone, so still you would take it for slate until something rises in it.",
  },
  {
    locationRef: "tarnreach/the-boathouse",
    clue: "In among the rope, beside a vessel that has not touched water in anyone's memory and is not about to start.",
  },
  {
    locationRef: "tarnreach/the-warming-hut",
    clue: "Where the stove is kept lit by whoever passes and nobody has ever been asked to pay for what is in the pot.",
  },
  {
    locationRef: "tarnreach/the-stonesetters-hut",
    clue: "Face down on a long table among things that come in twos, at the one place where sorting by memory is insisted to be work.",
  },
  {
    locationRef: "tarnreach/the-morning-slate",
    clue: "Beside a slate the size of a door, ruled into squares, chalked before anyone was awake to see it done.",
  },
  {
    // Names the descent without naming the place, the same way every
    // other clue does — a player who has read the location's own
    // description can get here and nobody else can.
    locationRef: "tarnreach/blackfell-scar",
    clue: "On the fourth step down, where whoever was cutting them stopped cutting. I would rather not go any further in, and neither would you.",
  },
  {
    locationRef: "tarnreach/the-upper-tarn",
    clue: "An hour further up and colder for it, over water nobody has bothered to find the bottom of.",
  },
  {
    locationRef: "tarnreach/windward-steps",
    clue: "Partway up two hundred and some cut stones on the exposed side. Nobody has ever counted them going up, so nobody will find me quickly.",
  },
  {
    locationRef: "tarnreach/the-cairn-field",
    clue: "Among hundreds of stacked stones that mark nothing at all. Adding one is polite. Knocking one over is not.",
  },
  {
    locationRef: "tarnreach/coldspring-well",
    clue: "Next to the cup on the chain, where the water comes up at the same temperature whatever the year is doing.",
  },
] satisfies LanternCluesContent;
