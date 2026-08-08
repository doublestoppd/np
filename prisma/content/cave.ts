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
 * **Something lives down there.** It is never described, never named, and
 * never seen whole — the most any line gives you is a sound, a movement,
 * or the fact that it got there first. That restraint is the tone: this
 * should read as *probably dangerous*, not as a horror story, and a
 * player who wants to imagine something worse than anything written here
 * is welcome to.
 *
 * The turned-back lines are where it appears, and they all end the same
 * way: it sees you off, and then it goes and sits at the entrance. That
 * is the in-world reason for one descent a day — not a cooldown, but
 * something waiting at the top of the steps for the rest of the
 * afternoon.
 *
 * **The hard rule underneath the tone.** Nothing down here hurts a
 * companion, nothing is confiscated, and nobody is scolded. Being seen
 * off costs the day and nothing else, and every coin found on the way
 * down is kept. Tension is allowed; consequence is not. Each block is
 * newline-joined and one line is picked at random.
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
      "The steps hold. Whoever cut them stopped for a reason, and it was not the stone.",
      "Cold air comes up to meet you, out of a hole that ought to be still.",
      "The daylight goes narrow behind you and then goes out.",
    ].join("\n"),
    turnedBackFlavor: [
      "Four steps down, something below you stops moving. You have not heard it move. You only know it has stopped. You are back in daylight before you have finished deciding to leave, and it comes up as far as the fourth step and settles there.",
      "The water beside the steps goes still, all at once, the way water does when something in it has noticed you. You go back up. It follows to the light and no further, and stays.",
      "Wet stone, and a print in it that is not yours and is not old. The print is pointing the way you were going. You take the hint and leave, and something comes up behind you and sits down in the entrance.",
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
      "A coin purse on the shelf, left a long time ago by somebody who did not come back up for it.",
      "There is money under the loose flag, which is where you would have put it too.",
      "A tin behind a stone, and coins in the tin, and whoever hid it never came back to move it on.",
    ].join("\n"),
    turnedBackFlavor: [
      "The passage narrows, and then something in the dark ahead of you breathes out, and the narrowing stops being the problem. You do not go on. It sees you all the way to the steps and stops at the top of them.",
      "The bats leave the passage in one piece, all together, going the same way you are about to. They know something. You agree with them. Behind you, unhurried, something takes up position in the entrance.",
      "You get eleven paces in and the dark ahead rearranges itself, quietly, into a shape and then back out of one. You are still walking backwards when you reach the landing, and it walks forwards the whole way.",
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
      "The dripping stops. Not slows — stops, in one beat, the way a room does when somebody in it has raised a hand. You do not wait to see whose. It walks you out and takes the entrance.",
      "Something above you shifts its grip. You do not look up. You go back at speed, still not looking up, and the ceiling comes with you as far as the daylight.",
      "The arch you chose is wet all the way round, in the shape of something that filled it recently and is no longer in it. You leave the way you came, and it is at the top before you are.",
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
      "The brickwork was not built to keep the cave out. It is far too thick on the wrong side for that. Whatever it was built to hold in is on your side of it now, and you are running.",
      "Something has been through this doorway many times. There is a groove worn in the stone at exactly the height of your chest. You leave. It escorts you, at that height, the whole way.",
      "You put a hand on the wall and something on the other side of the wall puts a hand back. You do not remember the walk out. You remember what is sitting at the entrance when you get there.",
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
      "Halfway across, the plank takes weight at the far end that is not yours. You reverse without looking up, and whatever crosses behind you is on the steps by the time you are.",
      "Nine rungs down, the ladder goes slack in your hands, because at the bottom something has taken hold of it to see what is coming. You go up faster than you came down.",
      "From the gap below, something breathes in — long, slow, and far too large for the room. You are back at the near side before you finish deciding to be, and it is at the entrance before you finish the climb.",
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
      "The stairwell is blocked to within a foot of the ceiling, from below, by somebody who was in a great hurry and did not manage it. You do not investigate. Something down there notices you not investigating, and sees you out anyway.",
      "The draught takes your lamp out, and in the dark the draught turns out to be breathing. You climb. It climbs behind you, patient about it, and stops at the light.",
      "Four steps down, something coming up meets you, and it is entirely calm, and it is very large, and calm is somehow the worse half. You reverse the whole way. It follows to the entrance and stays there.",
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
      "The whispering resolves, halfway along, into wind through a hole. You would like to believe that. You keep walking.",
      "It stops. All of it, at once, as though something had put its hand over the passage. You keep going anyway.",
      "You come out of the cut into a room with a ceiling you cannot see, which is progress of a kind.",
    ].join("\n"),
    turnedBackFlavor: [
      "The whispering answers you, in your own voice, from further in than you have been. You are gone before the sentence finishes, and it comes up the cut after you, still using your voice, all the way to the steps.",
      "The slot at the end of the fork exhales — warm, and slow, and twice. Nothing that size should be able to fit in there. It fits. You leave, and it is waiting where the daylight starts.",
      "The fork ends in a wall, and on the walk back the whispering is behind you instead of ahead, keeping pace, saying nothing you can quite make out. It stops at the entrance. It does not leave the entrance.",
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
      "Six paces out, the stones stop being stones. They are the tops of things, and the things are attached to something, and the something is beginning to take an interest. You go back over them faster than is sensible.",
      "The ledge is four inches wide and wet in a long unbroken smear, at your shoulder height, all the way round. Something uses this route. You would rather not meet it on it, and you turn out to be right about that.",
      "The water shifts against the far wall with no wind to move it, and keeps shifting, coming your way. You are out of the hall and up the passage and it is ahead of you at the entrance, dry, and waiting.",
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
      "It opens without a sound. The hinges have been kept. You do not want to think about by whom.",
      "The handle turns. Warm air comes out, and light that is not yours, and no sound at all.",
      "It opens onto steps going up. You had not expected up.",
    ].join("\n"),
    turnedBackFlavor: [
      "It opens onto brickwork, laid from this side, in a hurry, by somebody who did not finish. What they were shutting out of the last room is in the last room with you now, and you go.",
      "It opens onto the room you were just in, from an angle that is not possible, and something is standing in it with its back to you. You close the door very quietly. It opens the door.",
      "The handle turns easily, because it has been turned recently, and often, and not by you. You are back up nine rooms and it lets you go the whole way — then takes the entrance and settles.",
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
      "One room short, and the wrong way is a chimney, and the chimney has been worn smooth by something going up and down it that is a great deal bigger than you. You come out four miles away, unhurt, holding your hat.",
      "Something enormous rolls over in its sleep between you and the door, and does not wake, and you are still shaking on the fellside an hour later. It is at the entrance by evening, awake.",
      "It is between you and the hoard, and it has been between you and the hoard the entire way down, letting you come. You go back up nine rooms knowing that. It does not need to chase you. It is at the top when you get there.",
    ].join("\n"),
  },
] as const satisfies readonly CaveSectionContent[];
