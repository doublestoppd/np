import type { DbClient } from "@/server/db";
import { isNormalizedWord, normalizeWord } from "./evaluate";

/**
 * Validated word-content pipeline (docs/operations.md — word content).
 * Answer pools are a curated, content-reviewed subset; the accepted-guess
 * dictionary is deliberately much broader. Everything is normalized to
 * uppercase ASCII before storage; anything containing spaces, punctuation,
 * hyphens, apostrophes, or numerals is rejected by the A–Z check.
 */

const MIN_LENGTH = 4;
const MAX_LENGTH = 6;

/**
 * Words never admitted to either pool. Deliberately reviewed content
 * moderation, not an exhaustive slur database — the ANSWER pool is a small
 * hand-reviewed list, so this blocklist only backstops the broad guess
 * dictionary import against the worst cases.
 */
const BLOCKED_WORDS = new Set(
  [
    "chink", "coons", "dyke", "dykes", "fagot", "gooks", "kikes", "negro",
    "nigga", "paki", "pakis", "spick", "spics", "tard", "tards", "wetback",
  ].map((word) => word.toUpperCase()),
);

export interface WordRejection {
  word: string;
  reason: "not-ascii-letters" | "bad-length" | "blocked";
}

export interface WordImportReport {
  submitted: number;
  imported: number;
  updated: number;
  rejected: WordRejection[];
}

function validateBatch(words: string[]): {
  valid: string[];
  rejected: WordRejection[];
} {
  const rejected: WordRejection[] = [];
  const valid = new Set<string>();
  for (const raw of words) {
    const word = normalizeWord(raw);
    if (word.length === 0) {
      continue;
    }
    if (!isNormalizedWord(word)) {
      rejected.push({ word, reason: "not-ascii-letters" });
    } else if (word.length < MIN_LENGTH || word.length > MAX_LENGTH) {
      rejected.push({ word, reason: "bad-length" });
    } else if (BLOCKED_WORDS.has(word)) {
      rejected.push({ word, reason: "blocked" });
    } else {
      valid.add(word);
    }
  }
  return { valid: [...valid], rejected };
}

/**
 * Imports accepted-guess dictionary words. Idempotent: duplicates after
 * normalization are skipped, existing rows are left untouched.
 */
export async function importGuessWords(
  db: DbClient,
  words: string[],
): Promise<WordImportReport> {
  const { valid, rejected } = validateBatch(words);
  const result = await db.wordEntry.createMany({
    data: valid.map((word) => ({
      word,
      length: word.length,
      acceptedAsGuess: true,
      eligibleAsAnswer: false,
    })),
    skipDuplicates: true,
  });
  return {
    submitted: words.length,
    imported: result.count,
    updated: 0,
    rejected,
  };
}

/**
 * Imports (or promotes) answer-pool words. Answers are always accepted as
 * guesses too, and carry content-review notes.
 */
export async function importAnswerWords(
  db: DbClient,
  words: string[],
  contentNotes: string,
): Promise<WordImportReport> {
  const { valid, rejected } = validateBatch(words);
  let imported = 0;
  let updated = 0;
  for (const word of valid) {
    const existing = await db.wordEntry.findUnique({ where: { word } });
    if (existing) {
      if (!existing.eligibleAsAnswer || !existing.acceptedAsGuess) {
        await db.wordEntry.update({
          where: { word },
          data: { eligibleAsAnswer: true, acceptedAsGuess: true, contentNotes },
        });
        updated++;
      }
    } else {
      await db.wordEntry.create({
        data: {
          word,
          length: word.length,
          acceptedAsGuess: true,
          eligibleAsAnswer: true,
          contentNotes,
        },
      });
      imported++;
    }
  }
  return { submitted: words.length, imported, updated, rejected };
}

/**
 * Content kill switch: deactivates (or reactivates) a word everywhere.
 * Inactive words are rejected as guesses and excluded from future answer
 * selection; existing puzzles keep their frozen answers.
 */
export async function setWordActive(
  db: DbClient,
  word: string,
  active: boolean,
): Promise<boolean> {
  const result = await db.wordEntry.updateMany({
    where: { word: normalizeWord(word) },
    data: { active },
  });
  return result.count > 0;
}

/** True when the normalized word is an accepted, active guess. */
export async function isAcceptedGuess(
  db: DbClient,
  word: string,
): Promise<boolean> {
  const entry = await db.wordEntry.findUnique({
    where: { word },
    select: { acceptedAsGuess: true, active: true },
  });
  return entry !== null && entry.acceptedAsGuess && entry.active;
}
