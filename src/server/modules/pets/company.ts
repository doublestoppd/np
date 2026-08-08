import { bondBand, BOND_BANDS } from "./bond";
import { NEED_DECAY_FLOOR, STAT_MAX } from "./pet-stats";

/**
 * What happened while you sat there (ADR-61). PURE — no database, no
 * clock, no randomness of its own.
 *
 * Sitting with a companion has almost no mechanical effect, so the line is
 * not decoration on top of the feature — it IS the feature. It has to be
 * worth reading twice a day for months, which means it has to be about
 * THIS companion right now: whether they are unwell, whether they are
 * hungry, whether the coat has just been done, and how long the two of you
 * have known each other.
 *
 * The lines never thank the player, never score them, and never ask for
 * anything. A sentence like "your companion missed you!" is a bill
 * disguised as affection; these are observations.
 */

export interface CompanionState {
  hunger: number;
  happiness: number;
  energy: number;
  health: number;
  coat: number;
  bond: number;
  /** True when something is currently the matter. */
  unwell: boolean;
}

/**
 * The lines, worst-fitting first — `describeSitting` returns the first
 * bucket that applies, so order is priority. Something being wrong always
 * wins, because a companion who is unwell and has a lovely coat is, to
 * their person, a companion who is unwell.
 */
const UNWELL = [
  "They settle against your leg and stay there, which is not like them, and you stay too.",
  "Not much doing. They doze, wake up, check you are still there, and doze again.",
  "You sit. They put their chin on your foot and sigh like the world has been unreasonable, which today it has.",
];

const HUNGRY = [
  "They sit with you, mostly, with one eye on the satchel the entire time.",
  "Company is accepted. Company is, it is gently implied, not the same thing as dinner.",
  "They lean on you and then get up and look at you and then lean on you again. The message is not subtle.",
];

const LOW_SPIRITS = [
  "It takes a while before they come over. They do come over.",
  "They sit a little way off at first, and then not so far off, and by the end they are against your knee.",
  "Nothing much is said. It seems to help anyway.",
];

const TIRED = [
  "They are asleep inside a minute, heavily, in the least convenient position available.",
  "You get about four seconds of attention and then a warm weight on your lap and some very serious snoring.",
  "Whatever they got up to today, they are done. You sit through all of it.",
];

const WELL_KEPT = [
  "They arrange themselves against you with the air of somebody who has earned this, and they have.",
  "Clean, fed, and thoroughly pleased about both. They stay put for the whole of it.",
  "You sit. They lean. Somewhere in the middle of it they fall asleep, and you do not move.",
];

/** From the first band up: how the sitting itself has changed over time. */
const BY_BAND = [
  [
    "They sit near you rather than with you, and keep an eye on the door. It is early days.",
    "Some distance is maintained, on principle. The principle weakens slightly by the end.",
    "They come over, think better of it, come over again, and settle about a foot away.",
  ],
  [
    "They come over without being asked, which is new.",
    "You sit down and they are there before you have finished sitting down.",
    "A companionable half-hour. They keep checking you have not gone anywhere.",
  ],
  [
    "They put their whole weight against you the moment you sit, and stay there until you move.",
    "No hesitation at all any more. You sit, they arrive, that is the arrangement.",
    "They fall asleep on you, completely, in the way that means they are not worried about anything.",
  ],
  [
    "They were there before you sat down. They may have known you were going to.",
    "You sit and they fold up against you like this is what the furniture is for.",
    "Neither of you does anything at all for half an hour. It is the best part of the day.",
  ],
  [
    "You sit. They are already leaning on you. Nobody had to decide anything.",
    "They do not so much come over as continue being where you are, which is where they were.",
    "A long quiet half-hour with somebody who has known you for a very long time.",
  ],
];

/**
 * Picks the line for this sitting.
 *
 * `roll` is supplied by the caller (0..n) rather than drawn here, so the
 * whole module stays pure and a test can pin the sentence.
 */
export function describeSitting(state: CompanionState, roll: number): string {
  const bucket = pickBucket(state);
  return bucket[Math.abs(roll) % bucket.length] as string;
}

function pickBucket(state: CompanionState): readonly string[] {
  if (state.unwell) return UNWELL;
  // The three needs, in the order a person would notice them.
  if (state.hunger <= NEED_DECAY_FLOOR + 10) return HUNGRY;
  if (state.happiness <= NEED_DECAY_FLOOR + 15) return LOW_SPIRITS;
  if (state.energy <= 25) return TIRED;
  // Nothing is wrong. Now the answer can be about the two of you, and it
  // gets better the longer that has been going on.
  if (state.coat >= STAT_MAX - 10 && state.hunger >= 70) return WELL_KEPT;
  const index = BOND_BANDS.indexOf(bondBand(state.bond));
  return BY_BAND[Math.min(index, BY_BAND.length - 1)] as readonly string[];
}
