import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { coinLabel, coinsFromJSON, coinsToJSON, formatCoins } from "@/lib/money";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { secureQuantity } from "@/server/modules/daily/random";
import { RANDOM_EVENTS } from "./catalog";
import {
  baseEventChanceBp,
  CHANCE_DENOMINATOR_BP,
  enforceRandomEventRateLimit,
  eventCooldownMaxMs,
  eventCooldownMinMs,
  maxEventsPerGameDay,
  randomEventsEnabled,
  rollMinIntervalMs,
} from "./config";
import { applyEffect, type EffectContext } from "./effects";
import { isEligibleRoute, normalizeRoutePath } from "./routes";
import { gameDateFor } from "@/server/modules/daily/game-day";
import { selectEligibleEvent } from "./selection";
import type {
  RandomEventDefinition,
  ResolvedEffect,
  ResolvedEventPayload,
} from "./types";

/**
 * Page-view random events (docs/architecture-decisions.md ADR-28).
 *
 * The client may ask for a roll; it decides nothing. Eligibility, pacing,
 * probability, selection, rewards, and the record are all resolved here.
 *
 * The whole roll is one transaction hanging off a single guarded write:
 * claiming `RandomEventState.lastRollAt` is simultaneously the
 * anti-duplicate check and the row lock that serializes everything after
 * it. A second concurrent request blocks on that row, re-evaluates the
 * guard once the first commits, sees the claim, and stops — so two
 * requests from the same eligible moment can never both produce an event.
 * An idempotency key on top means a retry after a lost response replays
 * the recorded outcome instead of rolling again.
 */

export type RollSkipReason =
  | "disabled"
  | "ineligible-route"
  | "duplicate"
  | "cooldown"
  /** The day already holds as many events as it can. */
  | "daily-cap"
  | "missed"
  | "empty-pool";

/** JSON-safe: this is stored verbatim as the idempotency replay payload. */
export type RollResult =
  | { outcome: "none"; reason: RollSkipReason }
  | { outcome: "event"; occurrenceId: string; payload: ResolvedEventPayload };

export interface RollParams {
  userId: string;
  /** Route the client reported. Validated and re-checked server-side. */
  routePath: string;
  /** One per page view, so a retried request replays instead of re-rolling. */
  idempotencyKey: string;
  now?: Date;
  /**
   * Catalog override. Production always uses the shipped catalog; this
   * exists so tests can pin an event set and so a future source of
   * definitions can be swapped in without touching the orchestration.
   */
  catalog?: readonly RandomEventDefinition[];
}

const NONE = (reason: RollSkipReason): RollResult => ({ outcome: "none", reason });

/** Longest per-event cooldown in the catalog; bounds the lookback query. */
function maxEventCooldownMs(catalog: readonly RandomEventDefinition[]): number {
  return catalog.reduce(
    (longest, event) =>
      Math.max(longest, (event.cooldownMinutes ?? 0) * 60_000),
    0,
  );
}

/** Resolves `{pet}` / `{player}` against the actual player and companion. */
function renderMessage(
  template: string,
  values: { pet: string | null; player: string },
): string {
  return template
    .replaceAll("{pet}", values.pet ?? "Your companion")
    .replaceAll("{player}", values.player);
}

/** One player-facing line summarising what was received. */
function summarize(effects: ResolvedEffect[]): string {
  const parts: string[] = [];
  for (const effect of effects) {
    if (effect.kind === "coins") {
      // effect.amount is the serialized form; a player must never see an
      // un-grouped decimal string where every other surface shows "1,240".
      const amount = coinsFromJSON(effect.amount);
      parts.push(`${formatCoins(amount)} ${coinLabel(amount)}`);
    } else if (effect.kind === "item") {
      parts.push(
        effect.quantity > 1
          ? `${effect.quantity} × ${effect.name}`
          : effect.name,
      );
    }
  }
  return parts.join(" and ");
}

/**
 * Makes sure the pacing row exists before the transaction needs to lock
 * it. Deliberately outside the roll: it carries no economic meaning, and a
 * concurrent create losing the unique race is not a failure — the row it
 * wanted now exists either way.
 */
async function ensureState(db: DbClient, userId: string): Promise<void> {
  try {
    await db.randomEventState.upsert({
      where: { userId },
      create: {
        userId,
        // Epoch, so the very first roll passes the interval guard.
        lastRollAt: new Date(0),
        cooldownUntil: new Date(0),
      },
      update: {},
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }
}

export async function rollRandomEvent(
  db: DbClient,
  {
    userId,
    routePath,
    idempotencyKey,
    now = new Date(),
    catalog = RANDOM_EVENTS,
  }: RollParams,
): Promise<RollResult> {
  if (!randomEventsEnabled()) {
    return NONE("disabled");
  }

  const path = normalizeRoutePath(routePath);
  if (path === null || !isEligibleRoute(path)) {
    // Not an error: prefetches, API calls, and auth pages all land here,
    // and the honest answer is "nothing happens", quietly.
    log.info("random-event.ineligible-route", { userId, routePath: path ?? "invalid" });
    return NONE("ineligible-route");
  }

  await enforceRandomEventRateLimit(db, "random-event-roll", userId, now);
  await ensureState(db, userId);

  log.info("random-event.attempt", { userId, routePath: path });

  // Carries the selected key out of the transaction so an effect failure
  // can be reported against the event that caused it.
  let attemptedKey: string | null = null;

  try {
    const { result } = await withIdempotency<RollResult>(
      db,
      {
        userId,
        operation: "random-event-roll",
        key: idempotencyKey,
        requestHash: requestHash({ routePath: path }),
      },
      async (tx) => {
        // (1) Claim the attempt. This guard is the anti-duplicate window
        // AND the serialization point for everything below it.
        const claimed = await tx.randomEventState.updateMany({
          where: {
            userId,
            lastRollAt: { lt: new Date(now.getTime() - rollMinIntervalMs()) },
          },
          data: { lastRollAt: now },
        });
        if (claimed.count === 0) {
          return NONE("duplicate");
        }

        // (2) Cooldown short-circuits before any dice are rolled.
        const state = await tx.randomEventState.findUniqueOrThrow({
          where: { userId },
          select: { cooldownUntil: true },
        });
        if (state.cooldownUntil > now) {
          return NONE("cooldown");
        }

        // (2b) The day's ceiling, checked before any dice. The cooldown
        // paces events; this bounds how many a day can hold at all, which
        // is what stops an unattended script out-earning a person 24 to 1
        // on a faucet nothing else limits.
        const today = await tx.randomEventOccurrence.count({
          where: { userId, gameDate: gameDateFor(now) },
        });
        if (today >= maxEventsPerGameDay()) {
          return NONE("daily-cap");
        }

        // (3) Does anything happen at all? Separate from which event.
        if (randomInt(0, CHANCE_DENOMINATOR_BP) >= baseEventChanceBp()) {
          return NONE("missed");
        }

        // (4) Build the selection context from server state only.
        const player = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { username: true, createdAt: true },
        });
        const pet = await tx.pet.findFirst({
          where: { ownerId: userId },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        });

        const keysWithCooldown = catalog.filter(
          (event) => (event.cooldownMinutes ?? 0) > 0,
        ).map((event) => event.key);
        const suppressedKeys = new Set<string>();
        if (keysWithCooldown.length > 0) {
          const recent = await tx.randomEventOccurrence.findMany({
            where: {
              userId,
              eventKey: { in: keysWithCooldown },
              createdAt: {
                gte: new Date(now.getTime() - maxEventCooldownMs(catalog)),
              },
            },
            select: { eventKey: true, createdAt: true },
          });
          for (const row of recent) {
            const definition = catalog.find((e) => e.key === row.eventKey);
            const windowMs = (definition?.cooldownMinutes ?? 0) * 60_000;
            if (row.createdAt.getTime() + windowMs > now.getTime()) {
              suppressedKeys.add(row.eventKey);
            }
          }
        }

        const chosen = selectEligibleEvent(catalog, {
          routePath: path,
          hasPet: pet !== null,
          accountAgeHours:
            (now.getTime() - player.createdAt.getTime()) / 3_600_000,
          suppressedKeys,
        });
        if (!chosen) {
          return NONE("empty-pool");
        }
        attemptedKey = chosen.key;

        // (5) Apply the effects. Any failure rolls back the claim, the
        // cooldown, the occurrence, and every reward together.
        const message = renderMessage(chosen.message, {
          pet: pet?.name ?? null,
          player: player.username,
        });
        const context: EffectContext = {
          userId,
          ledgerTransactionId: null,
          eventKey: chosen.key,
          eventTitle: chosen.title,
          petId: pet?.id ?? null,
          petName: pet?.name ?? null,
          now,
        };

        const resolved: ResolvedEffect[] = [];
        let coinsAwarded = 0n;
        let transactionId: string | null = null;
        for (const effect of chosen.effects) {
          const outcome = await applyEffect(tx, effect, context);
          resolved.push(outcome.resolved);
          coinsAwarded += outcome.coinsAwarded ?? 0n;
          transactionId = outcome.ledgerTransactionId ?? transactionId;
        }

        const payload: ResolvedEventPayload = {
          eventKey: chosen.key,
          title: chosen.title,
          message,
          category: chosen.category,
          rarity: chosen.rarity,
          effects: resolved,
          rewardSummary: summarize(resolved),
        };

        // (6) Freeze the record. Title, message, and effects are stored as
        // resolved values so retuning the catalog never edits history.
        const occurrence = await tx.randomEventOccurrence.create({
          data: {
            userId,
            gameDate: gameDateFor(now),
            eventKey: chosen.key,
            title: payload.title,
            message: payload.message,
            payload: payload as unknown as Prisma.InputJsonObject,
            coinsAwarded,
            routePath: path,
            transactionId,
          },
          select: { id: true },
        });

        // (7) Claim the cooldown last, in the same transaction.
        const cooldownMs = secureQuantity(
          eventCooldownMinMs(),
          eventCooldownMaxMs(),
        );
        await tx.randomEventState.update({
          where: { userId },
          data: {
            lastEventAt: now,
            cooldownUntil: new Date(now.getTime() + cooldownMs),
          },
        });

        return { outcome: "event", occurrenceId: occurrence.id, payload };
      },
    );

    if (result.outcome === "none") {
      if (result.reason === "duplicate" || result.reason === "cooldown") {
        log.info("random-event.suppressed", {
          userId,
          reason: result.reason,
          routePath: path,
        });
      }
      return result;
    }

    log.info("random-event.granted", {
      userId,
      eventKey: result.payload.eventKey,
      rarity: result.payload.rarity,
      category: result.payload.category,
      routePath: path,
      occurrenceId: result.occurrenceId,
      coins: coinsToJSON(
        result.payload.effects.reduce(
          (sum, effect) => (effect.kind === "coins" ? sum + BigInt(effect.amount) : sum),
          0n,
        ),
      ),
    });
    return result;
  } catch (error) {
    // An event is a garnish. It must never turn a page view into a
    // failure, so the error is recorded in full and the player is told
    // nothing happened — which, thanks to the rollback, is true.
    log.error("random-event.effect-failed", {
      userId,
      eventKey: attemptedKey,
      routePath: path,
      error: error instanceof Error ? error.message.slice(0, 200) : String(error),
    });
    return NONE("missed");
  }
}
