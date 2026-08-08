import { z } from "zod";
import { descriptionSchema, displayNameSchema, slugSchema } from "./common";

/**
 * Forum boards (ADR-56). Boards are the only authored part of the forum —
 * threads and posts are written by players and never appear here.
 */
export const forumBoardSchema = z.object({
  slug: slugSchema,
  name: displayNameSchema,
  description: descriptionSchema,
  /** Display order on the index; contiguous from 0 across all boards. */
  position: z.number().int().min(0),
  /**
   * Only moderators and administrators may start threads. Replying stays
   * open to everyone — a board nobody can reply to is a notice board, and
   * the game already has one of those.
   */
  staffOnly: z.boolean().default(false),
  active: z.boolean().default(true),
});

export type ForumBoardContent = z.input<typeof forumBoardSchema>;
