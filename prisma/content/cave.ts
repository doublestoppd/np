import type { CaveSectionContent } from "./schemas";

/**
 * The Sunken Stair, section by section (ADR-59).
 *
 * Ten rooms in a fixed order, each with two ways on. Which way is the way
 * on is decided per delve from that delve's own seed, so this file is the
 * shape of the descent and contains no answers — there is nothing here
 * that would help a player, and nothing that would help them help anybody
 * else.
 *
 * **The two doors in every section must be symmetric.** That is the one
 * authoring rule with teeth, and it is checked offline. A pair like "the
 * dry passage" against "the flooded one" is not a choice: one reads safer,
 * every player picks it, and the section is decoration. So the doors here
 * are always two of a kind — left and right, up and down, the one that
 * smells of smoke and the one that smells of rain. Neither is the sensible
 * one. That is the point.
 *
 * The turned-back lines are written to be FUNNY AND SURVIVABLE. Nothing
 * down here hurts a companion, nothing is confiscated, and nobody is
 * scolded — the worst outcome in this game is being politely seen off by
 * something that lives in a hole. Each block is newline-joined and one
 * line is picked at random.
 */
export const caveSections = [
  {
    sectionIndex: 1,
    name: "The Threshold",
    description:
      "A crack in the hillside a shade wider than it looks from outside. Somebody has cut steps, badly, and given up on the fourth one.",
    doorOne: "Follow the cut steps down",
    doorTwo: "Follow the water in beside them",
    onwardFlavor: [
      "The steps hold. Whoever cut them knew one thing, at least.",
      "Cold air comes up to meet you, which is either welcoming or a warning.",
      "The daylight goes narrow behind you and then goes out.",
    ].join("\n"),
    turnedBackFlavor: [
      "An owl you had not noticed decides you are the most interesting thing to happen all week, and escorts you back to the hillside at close range.",
      "The floor is not a floor. You are ankle-deep, then knee-deep, then reconsidering, in about four seconds.",
      "A goat. In the cave. Standing on the steps. It does not move and you are not going to be the one who insists.",
    ].join("\n"),
  },
  {
    sectionIndex: 2,
    name: "The First Landing",
    description:
      "The stair opens into a room with a shelf of dry stone along one wall. Two passages leave it, one on each side, the same size.",
    doorOne: "Take the left-hand passage",
    doorTwo: "Take the right-hand passage",
    onwardFlavor: [
      "Somebody left a coin purse on the shelf, a long time ago, and never came back for it.",
      "There is money under the loose flag, which is where you would have put it too.",
      "A tin behind a stone, and coins in the tin, and nobody around to argue about it.",
    ].join("\n"),
    turnedBackFlavor: [
      "The passage narrows, then narrows again, then becomes a decision about your shoulders that you lose.",
      "Bats. Not dangerous, not aggressive, and absolutely not something you are going to walk through.",
      "The floor slopes gently, then less gently, and you arrive back at the landing faster than you left it and on your back.",
    ].join("\n"),
  },
  {
    sectionIndex: 3,
    name: "The Dripping Gallery",
    description:
      "A long room where water comes off the ceiling in a steady, unhurried way. Two arches at the far end, both wet.",
    doorOne: "The arch under the pale stain",
    doorTwo: "The arch under the dark stain",
    onwardFlavor: [
      "The dripping stops behind you, all at once, as though it had been keeping time with something.",
      "The floor goes dry underfoot, which after that room is a small luxury.",
      "The gallery closes up behind you into an ordinary passage, and you decide not to look back.",
    ].join("\n"),
    turnedBackFlavor: [
      "The arch is not an arch, it is a puddle reflecting one, and you walk into a wall with real conviction.",
      "Something above you shifts its grip. You do not look up. You go back, at speed, still not looking up.",
      "A frog, roughly the size of a loaf, blinks once. You leave. You could not tell anybody why.",
    ].join("\n"),
  },
  {
    sectionIndex: 4,
    name: "The Bricked Room",
    description:
      "Somebody built walls down here, square and careful, and then knocked two doorways through them. Nobody knows which came first.",
    doorOne: "Through the doorway with the fallen lintel",
    doorTwo: "Through the doorway with the standing lintel",
    onwardFlavor: [
      "A strongbox with a broken hasp, and enough left in it to make the walk worthwhile.",
      "Coins in a wall cavity, stacked in neat tens by somebody who counted twice.",
      "Whoever bricked this room kept their wages behind the third course, and never spent them.",
    ].join("\n"),
    turnedBackFlavor: [
      "The lintel decides, after a hundred and forty years of deliberation, that today is the day. You are already running.",
      "Wasps. Underground. Furious about it. Nobody wins this.",
      "You put a hand on the wall and the wall puts a considerable amount of itself on the floor, loudly, and you take the hint.",
    ].join("\n"),
  },
  {
    sectionIndex: 5,
    name: "The Bridge of One Plank",
    description:
      "A gap in the floor with a plank across it, and beside the plank a rope ladder going down into the same gap. Both look about as old as the other.",
    doorOne: "Cross on the plank",
    doorTwo: "Climb down the ladder",
    onwardFlavor: [
      "It holds. You do not test it twice.",
      "Halfway across you decide not to think about it, and that turns out to be the correct method.",
      "You are over. Behind you the gap says nothing, which is the best thing a gap can say.",
    ].join("\n"),
    turnedBackFlavor: [
      "The plank is fine. The plank is excellent. The plank is, unfortunately, resting on a ledge made entirely of optimism.",
      "The ladder holds for nine rungs. It was a ten-rung problem.",
      "Something down in the gap coughs. Politely. You are back at the near side before you have finished deciding to be.",
    ].join("\n"),
  },
  {
    sectionIndex: 6,
    name: "The Sorting Floor",
    description:
      "A wide flat room with the remains of tables in rows. Two stairwells go down from it, one at each end, and the tables face neither.",
    doorOne: "Down the near stairwell",
    doorTwo: "Down the far stairwell",
    onwardFlavor: [
      "The tills are still under the tables. Some of them still have something in.",
      "Whatever they were sorting here, they were paid for it, and not all of it got carried out.",
      "A drawer, stuck, then unstuck, and a satisfying weight of coins in the bottom of it.",
    ].join("\n"),
    turnedBackFlavor: [
      "The stairwell has been filled in with rubble to within a foot of the ceiling. Somebody wanted that shut.",
      "A draught comes up it hard enough to take your lamp out, twice, and the third time you take the point.",
      "You get four steps down and a large, entirely calm badger comes up two. You reverse. It follows, just far enough to be sure.",
    ].join("\n"),
  },
  {
    sectionIndex: 7,
    name: "The Whispering Cut",
    description:
      "A narrow passage where the air moves and the walls, unhelpfully, carry sound a very long way. It forks, and both forks whisper.",
    doorOne: "The fork that whispers on the intake",
    doorTwo: "The fork that whispers on the outbreath",
    onwardFlavor: [
      "The whispering resolves, halfway along, into wind through a hole. You feel much better and slightly disappointed.",
      "It stops. All of it. The silence is worse and you keep going anyway.",
      "You come out of the cut into a room with a ceiling you cannot see, which is progress of a kind.",
    ].join("\n"),
    turnedBackFlavor: [
      "The whispering answers you back, using your own voice, from further in. You are gone before the sentence finishes.",
      "The passage narrows to a slot and the slot exhales, warm, and that is enough of that for one day.",
      "It is a very long fork and it ends in a wall, and the walk back gives you plenty of time to think about the whispering.",
    ].join("\n"),
  },
  {
    sectionIndex: 8,
    name: "The Flooded Hall",
    description:
      "Still black water, wall to wall, deep enough to matter. Two ways across: a line of stepping stones, and a ledge running round the side.",
    doorOne: "Cross by the stepping stones",
    doorTwo: "Edge round on the ledge",
    onwardFlavor: [
      "Dry on the far side, and a strongbox on the shelf above the waterline that nobody could reach without getting here.",
      "The far bank is heaped with what the water has been quietly bringing along for years, including the heavy parts.",
      "Somebody's pack, above the flood line, and coins in it, and no sign at all of somebody.",
    ].join("\n"),
    turnedBackFlavor: [
      "The stones are stones for six paces and then they are not stones, they are the tops of things, and the things go down a long way.",
      "The ledge is four inches wide. It was six when you started. You go back while it is still four.",
      "The water is colder than water should be able to be, and it makes the decision on your behalf about a third of the way over.",
    ].join("\n"),
  },
  {
    sectionIndex: 9,
    name: "The Last Door",
    description:
      "Two doors, side by side, in a wall that has been down here longer than the rest of it. Both are shut. Both have handles.",
    doorOne: "The left-hand door",
    doorTwo: "The right-hand door",
    onwardFlavor: [
      "It opens without a sound, which after nine rooms of this place is frankly showing off.",
      "The handle turns. Warm air comes out, and light that is not yours.",
      "It opens onto steps going up. You had not expected up.",
    ].join("\n"),
    turnedBackFlavor: [
      "It opens onto brickwork. Somebody went to real trouble to be this unhelpful.",
      "It opens onto the room you were just in, from an angle that is not possible, and you decide today is not the day to investigate.",
      "The handle comes off in your hand. The door, sympathetically, locks.",
    ].join("\n"),
  },
  {
    sectionIndex: 10,
    name: "The Hoard",
    description:
      "A dry, warm, perfectly ordinary room with a great deal in it. Two ways out, and one of them is the way you would want.",
    doorOne: "Go left, towards the lamplight",
    doorTwo: "Go right, towards the draught",
    onwardFlavor: [
      "Everything anybody ever carried down here and did not carry back out. It has been waiting, and it does not seem to have minded.",
      "Not treasure, exactly. Belongings. A great many people's, kept dry for a very long time, and nobody left to want them.",
      "The lamps are lit. They should not be lit. You decide to think about that later, on the way home, with your arms full.",
    ].join("\n"),
    turnedBackFlavor: [
      "You are one room from it and you go the wrong way, and the wrong way is a chimney, and the chimney is a slide, and the slide is long.",
      "Something enormous and entirely uninterested rolls over in its sleep between you and the door. You back out with great care.",
      "The floor gives. You land, unhurt, in daylight, in a field, four miles away, holding your hat.",
    ].join("\n"),
  },
] as const satisfies readonly CaveSectionContent[];
