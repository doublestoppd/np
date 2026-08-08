import type { ArcadeGame } from "@prisma/client";
import type { DbClient } from "@/server/db";
import {
  enforceRateLimit,
  type RateLimitRule,
} from "@/server/security/rate-limit";
import {
  PAPER_BIRD_CURVE,
  SNAKE_CURVE,
  TREE_CLIMB_CURVE,
  type RewardCurve,
} from "@/lib/games/arcade/rewards";
import { paperBirdSim } from "@/lib/games/arcade/paper-bird";
import { treeClimbSim } from "@/lib/games/arcade/tree-climb";
import { snakeSim } from "@/lib/games/arcade/snake";
import type { ArcadeSim } from "@/lib/games/arcade/core";

/**
 * Which game is which (ADR-62).
 *
 * The one place the enum meets its simulation, its curve, its content key
 * and its name. Everything downstream — starting a run, replaying it,
 * paying it, listing it in the directory — is written against
 * `ARCADE_GAMES[game]` and never against a specific game, which is what
 * lets a third one be four lines here plus a physics file.
 *
 * `Record<ArcadeGame, …>` is exhaustive at compile time, so adding a value
 * to the enum without describing it here is a type error rather than a
 * runtime surprise.
 */
export interface ArcadeGameConfig {
  /** Stable content key for the activity attachment. */
  activityKey: string;
  name: string;
  /** What the player is scoring, singular and plural. */
  unit: [one: string, many: string];
  curve: RewardCurve;
  // The state type differs per game and nothing outside the simulation
  // ever looks inside it, so this is the one place `unknown` is right:
  // the harness only ever calls start/step/ended/score.
  sim: ArcadeSim<unknown>;
}

export const ARCADE_GAMES: Record<ArcadeGame, ArcadeGameConfig> = {
  PAPER_BIRD: {
    activityKey: "the-paper-bird",
    name: "The Paper Bird",
    unit: ["wall", "walls"],
    curve: PAPER_BIRD_CURVE,
    sim: paperBirdSim as ArcadeSim<unknown>,
  },
  TREE_CLIMB: {
    activityKey: "the-long-way-up",
    name: "The Long Way Up",
    unit: ["branch", "branches"],
    curve: TREE_CLIMB_CURVE,
    sim: treeClimbSim as ArcadeSim<unknown>,
  },
  SNAKE: {
    activityKey: "the-long-grass",
    name: "The Long Grass",
    unit: ["apple", "apples"],
    curve: SNAKE_CURVE,
    sim: snakeSim as ArcadeSim<unknown>,
  },
};

/**
 * Generous, because a run is one start and one submission but a player
 * who keeps dying at the first wall will restart a great many times in a
 * minute, and being rate-limited for enthusiasm would be absurd.
 */
const RULES = {
  "arcade-start": { name: "arcade-start", limit: 40, windowSeconds: 60 },
  "arcade-submit": { name: "arcade-submit", limit: 40, windowSeconds: 60 },
  // Tighter, because there is nothing to be enthusiastic about here: three
  // claims a day means at most three of these succeed, and anything past
  // that is a double tap or somebody poking at it.
  "arcade-claim": { name: "arcade-claim", limit: 20, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type ArcadeRateLimitedOperation = keyof typeof RULES;

export async function enforceArcadeRateLimit(
  db: DbClient,
  operation: ArcadeRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}
