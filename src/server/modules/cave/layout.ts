import { createHash, randomBytes } from "node:crypto";

/**
 * Which door is the way on. SERVER ONLY.
 *
 * The seed is the entire security model, and the model is the Sorting
 * Bench's and the matching table's: the client sends a door number, the
 * server holds the seed and decides. There is no field a browser can
 * forge, because the browser is never told anything to forge — a delve in
 * progress reveals its history and nothing about its future.
 *
 * **The seed is random per delve, not derived from the player and the
 * date.** Derived would be cheaper and is the wrong trade: one leaked
 * secret would expose every player's cave for every past and future day at
 * once, where a random seed leaks exactly one descent that is already
 * over. It is also why this file is not `src/lib` — nothing here may reach
 * a client bundle.
 *
 * Randomising per player AND per day is what makes the cave safe to talk
 * about. The word puzzle and the lantern needed rotation bands (ADR-44)
 * because their answer is a public fact the moment one player posts it;
 * here there is no shared answer to post. A player can describe their
 * whole route in the forums and it helps nobody, including themselves
 * tomorrow.
 */

export function newDelveSeed(): string {
  return randomBytes(16).toString("hex");
}

/**
 * The door that goes on at this depth: 0 or 1.
 *
 * SHA-256 over `seed:depth`, low bit. Pinned rather than borrowed from the
 * platform because a delve in progress must not change under its player if
 * anything about the runtime ever changes.
 */
export function correctDoor(seed: string, depth: number): 0 | 1 {
  const digest = createHash("sha256").update(`${seed}:${depth}`).digest();
  return ((digest[0] as number) & 1) as 0 | 1;
}

/**
 * Replays a choice log against a seed.
 *
 * `choices` is one character per answered room, "0" or "1". Returns how
 * deep the player got and whether they are still going — the same
 * derive-don't-store shape the matching table uses, so the stored row
 * cannot disagree with the rules.
 */
export interface DelveReplay {
  /** Rooms answered correctly, i.e. the depth reached. */
  depth: number;
  /** True once a wrong door has been opened. */
  turnedBack: boolean;
  /** The room a wrong turn happened in, 1-based; null when still going. */
  turnedBackAt: number | null;
}

export function replayChoices(seed: string, choices: string): DelveReplay {
  for (let index = 0; index < choices.length; index += 1) {
    const depth = index + 1;
    const chosen = choices[index] === "1" ? 1 : 0;
    if (chosen !== correctDoor(seed, depth)) {
      return { depth: index, turnedBack: true, turnedBackAt: depth };
    }
  }
  return { depth: choices.length, turnedBack: false, turnedBackAt: null };
}
