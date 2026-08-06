/**
 * Offline content-validation rules (no database). Each test clones the
 * shipped content and mutates one aspect, so the rules are exercised
 * against realistic data without maintaining a parallel fixture world.
 */
import { describe, expect, it } from "vitest";
import { gameContent, type GameContent } from "../content";
import {
  ContentValidationError,
  countWordAnswers,
  validateContent,
  WORD_MIN_ACTIVE_ANSWERS,
} from "./validation";

function cloneContent(): GameContent {
  // structuredClone preserves bigint prices and nested arrays.
  return structuredClone(gameContent) as GameContent;
}

function problemsOf(content: GameContent) {
  try {
    validateContent(content);
    return [];
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return error.problems;
    }
    throw error;
  }
}

describe("shipped content", () => {
  it("passes validation as authored", () => {
    expect(() => validateContent(cloneContent())).not.toThrow();
  });

  it("reports total and active word answers separately", () => {
    const content = cloneContent();
    const entries = content.daily.wordAnswers.EASY as unknown as (
      | string
      | { word: string; active: boolean }
    )[];
    const firstWord =
      typeof entries[0] === "string" ? entries[0] : entries[0]!.word;
    entries[0] = { word: firstWord, active: false };
    entries.push("ZYXW");
    const counts = countWordAnswers(content.daily.wordAnswers);
    expect(counts.EASY.total).toBe(101);
    expect(counts.EASY.active).toBe(100);
  });
});

describe("region-scoped location slugs", () => {
  it("rejects duplicate location slugs within the same region", () => {
    const content = cloneContent();
    const region = content.regions[0]!;
    const locations = region.locations as unknown as { slug: string }[];
    locations[1]!.slug = locations[0]!.slug;
    const problems = problemsOf(content);
    expect(
      problems.some(
        (p) =>
          p.message.includes("duplicate location slug within region") &&
          p.subject === `${region.slug}/${locations[0]!.slug}`,
      ),
    ).toBe(true);
  });

  it("allows different regions to reuse the same location slug", () => {
    const content = cloneContent();
    const source = content.regions[0]!;
    const reused = structuredClone(source.locations[0]!);
    const second = {
      ...structuredClone(source),
      slug: "second-region",
      name: "Second Region",
      locations: [reused],
    };
    (content.regions as unknown as unknown[]).push(second);
    const problems = problemsOf(content);
    expect(
      problems.filter((p) => p.message.includes("duplicate location slug")),
    ).toEqual([]);
  });

  it("rejects a shop whose location exists only in a different region", () => {
    const content = cloneContent();
    const shop = content.npcShops[0]! as unknown as { regionSlug: string };
    shop.regionSlug = "some-other-region";
    const problems = problemsOf(content);
    expect(
      problems.some(
        (p) =>
          p.domain === "npc-shops" &&
          p.message.includes("unknown location") &&
          p.message.includes("region + location slug"),
      ),
    ).toBe(true);
  });
});

describe("word answer capacity", () => {
  it("requires at least 100 configured entries per difficulty", () => {
    const content = cloneContent();
    (content.daily.wordAnswers.HARD as unknown as unknown[]).length = 99;
    const problems = problemsOf(content);
    // Schema floor (min 100) plus the active-capacity policy both flag it.
    expect(problems.some((p) => p.subject.startsWith("daily.wordAnswers.HARD"))).toBe(
      true,
    );
    expect(
      problems.some(
        (p) => p.domain === "daily-words" && p.subject === "HARD",
      ),
    ).toBe(true);
  });

  it("fails actionably when active answers drop below the policy floor", () => {
    const content = cloneContent();
    const entries = content.daily.wordAnswers.MEDIUM as unknown as (
      | string
      | { word: string; active: boolean }
    )[];
    const firstWord =
      typeof entries[0] === "string" ? entries[0] : entries[0]!.word;
    entries[0] = { word: firstWord, active: false };
    const problems = problemsOf(content);
    const problem = problems.find(
      (p) => p.domain === "daily-words" && p.subject === "MEDIUM",
    );
    expect(problem).toBeDefined();
    expect(problem?.message).toContain(`99 of 100`);
    expect(problem?.message).toContain(String(WORD_MIN_ACTIVE_ANSWERS));
    expect(problem?.message).toContain("append replacement words");
  });

  it("accepts more than 100 entries so words can be appended", () => {
    const content = cloneContent();
    (content.daily.wordAnswers.EASY as unknown as string[]).push("ZYXW");
    expect(problemsOf(content)).toEqual([]);
  });
});
