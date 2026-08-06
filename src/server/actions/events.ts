"use server";

import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { rollRandomEvent } from "@/server/modules/events/roll";
import type { ResolvedEventPayload } from "@/server/modules/events/types";
import { randomEventRollSchema } from "@/lib/validation";
import { correlationId, log } from "@/server/logging";

/**
 * The only way a random-event roll can be requested.
 *
 * Everything the client sends is a hint: the route it believes it is on,
 * and an idempotency key for the page view. Eligibility, pacing,
 * probability, selection, and rewards are decided in the domain module.
 *
 * Nothing here redirects or throws. A roll is a garnish on a page the
 * player already has — an unauthenticated caller, a malformed payload, a
 * rate limit, or an outright defect must all resolve to "nothing
 * happened", never to an error the player has to read.
 */

export interface RandomEventPresentation {
  occurrenceId: string;
  title: string;
  message: string;
  category: string;
  rarity: string;
  /** "" for flavour-only events. */
  rewardSummary: string;
  effects: ResolvedEventPayload["effects"];
}

export interface RollRandomEventResult {
  event: RandomEventPresentation | null;
}

const NOTHING: RollRandomEventResult = { event: null };

export async function rollRandomEventAction(input: {
  routePath: string;
  idempotencyKey: string;
}): Promise<RollRandomEventResult> {
  // No `requireUser`: a signed-out caller gets silence, not a redirect
  // that would yank a public page out from under them.
  const user = await getCurrentUser();
  if (!user) {
    return NOTHING;
  }

  const parsed = randomEventRollSchema.safeParse(input);
  if (!parsed.success) {
    return NOTHING;
  }

  try {
    const result = await rollRandomEvent(prisma, {
      userId: user.id,
      routePath: parsed.data.routePath,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    if (result.outcome === "none") {
      return NOTHING;
    }
    return {
      event: {
        occurrenceId: result.occurrenceId,
        title: result.payload.title,
        message: result.payload.message,
        category: result.payload.category,
        rarity: result.payload.rarity,
        rewardSummary: result.payload.rewardSummary,
        effects: result.payload.effects,
      },
    };
  } catch (error) {
    log.error("action.failed", {
      correlationId: correlationId(),
      op: "random-event-roll",
      userId: user.id,
      error: error instanceof Error ? error.message.slice(0, 200) : String(error),
    });
    return NOTHING;
  }
}
