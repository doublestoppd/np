import { z } from "zod";
import { descriptionSchema, displayNameSchema, slugSchema } from "./common";

/**
 * The Sunken Stair (ADR-59): ten authored rooms, and the pool of things
 * in the last one.
 *
 * There are no answers in this content. Which of a section's two doors is
 * the way on is drawn per delve from that delve's own seed, on the
 * server — so this file describes the descent and gives nothing away,
 * which is what lets it be read by anybody without spoiling anything.
 */

/**
 * A door label.
 *
 * Short, because two of them sit side by side on a 360px screen and a
 * paragraph in a button is not a choice anybody reads.
 */
const doorSchema = z.string().trim().min(3).max(80);

export const caveSectionSchema = z
  .object({
    /** 1-based depth. The order is fixed; only the doors move. */
    sectionIndex: z.number().int().min(1).max(10),
    name: displayNameSchema,
    description: descriptionSchema,
    doorOne: doorSchema,
    doorTwo: doorSchema,
    /** Newline-joined; one line picked at random on a wrong turn. */
    turnedBackFlavor: z.string().trim().min(1).max(4_000),
    /** Newline-joined; one line picked at random on the way through. */
    onwardFlavor: z.string().trim().min(1).max(4_000),
  })
  .superRefine((section, ctx) => {
    if (section.doorOne === section.doorTwo) {
      ctx.addIssue({
        code: "custom",
        message: `cave section ${section.sectionIndex}: the two doors must differ`,
      });
    }
    /**
     * Every flavour block must actually contain a line.
     *
     * An empty block is the exact content mistake that let a fishing cast
     * spend a turn and show the player nothing at all (see
     * modules/daily/random.ts). The shared picker has a non-empty fallback
     * now, but a room whose whole personality is its flavour text should
     * fail the build rather than quietly read as boilerplate.
     */
    for (const key of ["turnedBackFlavor", "onwardFlavor"] as const) {
      const lines = section[key]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: `cave section ${section.sectionIndex}: ${key} has no lines in it`,
        });
      }
    }
  });

export const caveHoardEntrySchema = z.object({
  itemSlug: slugSchema,
  /** Relative likelihood within the hoard. Higher is commoner. */
  selectionWeight: z.number().int().min(1).max(10_000),
  active: z.boolean().default(true),
});

export type CaveSectionContent = z.input<typeof caveSectionSchema>;
export type CaveHoardEntryContent = z.input<typeof caveHoardEntrySchema>;
