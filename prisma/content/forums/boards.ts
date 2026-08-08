import type { ForumBoardContent } from "../schemas";

/**
 * The boards (ADR-56).
 *
 * Deliberately few. A forum that opens with twelve boards has eleven
 * empty ones, and an empty board reads as a dead game — the cost of
 * splitting a small conversation is much higher than the cost of one
 * broad board being a little untidy. More can be added later from here,
 * which is exactly what content files are for.
 *
 * Nothing here is a support queue, a bug tracker, or a trading post.
 * Trading has a market with escrow and a ledger; a thread promising a
 * trade is a promise the game cannot keep, so there is no board inviting
 * one.
 *
 * The names avoid the undecided world concept, per CLAUDE.md — they
 * describe what the board is for in plain language and can be renamed
 * without touching anything but this file and the seed.
 */
export const forumBoards = [
  {
    slug: "announcements",
    name: "Announcements",
    description:
      "News about the game, written by the people making it. Anyone can reply.",
    position: 0,
    staffOnly: true,
    active: true,
  },
  {
    slug: "general",
    name: "General",
    description:
      "Anything about the game that isn't help or feedback. Companions, finds, what you're up to.",
    position: 1,
    staffOnly: false,
    active: true,
  },
  {
    slug: "help",
    name: "Questions and help",
    description:
      "Stuck on something, or not sure how a thing works? Ask here. Nobody minds a question that has been asked before.",
    position: 2,
    staffOnly: false,
    active: true,
  },
  {
    slug: "feedback",
    name: "Feedback and ideas",
    description:
      "What is working, what isn't, and what you'd like to see. This is pre-alpha; saying a thing is bad is useful.",
    position: 3,
    staffOnly: false,
    active: true,
  },
] satisfies ForumBoardContent[];
