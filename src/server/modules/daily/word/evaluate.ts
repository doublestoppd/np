/**
 * Pure guess evaluation with standard duplicate-letter behavior:
 * exact-position matches are marked first and consume their letter; a
 * non-exact letter is marked present only while an unmatched copy of it
 * remains in the answer; everything else is absent.
 *
 * Cell states: E (exact), P (present), A (absent). An evaluation is a
 * string with one state character per letter.
 */

export type CellState = "E" | "P" | "A";

export function normalizeWord(raw: string): string {
  return raw.normalize("NFKC").trim().toUpperCase();
}

export function isNormalizedWord(word: string): boolean {
  return /^[A-Z]+$/.test(word);
}

export function evaluateGuess(answer: string, guess: string): string {
  if (answer.length !== guess.length) {
    throw new Error("evaluateGuess requires equal-length normalized words");
  }
  const n = answer.length;
  const states: CellState[] = new Array<CellState>(n).fill("A");
  const unmatched = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) {
      states[i] = "E";
    } else {
      const letter = answer[i] as string;
      unmatched.set(letter, (unmatched.get(letter) ?? 0) + 1);
    }
  }
  for (let i = 0; i < n; i++) {
    if (states[i] === "E") {
      continue;
    }
    const letter = guess[i] as string;
    const remaining = unmatched.get(letter) ?? 0;
    if (remaining > 0) {
      states[i] = "P";
      unmatched.set(letter, remaining - 1);
    }
  }
  return states.join("");
}

export function isSolvedEvaluation(evaluation: string): boolean {
  return /^E+$/.test(evaluation);
}
