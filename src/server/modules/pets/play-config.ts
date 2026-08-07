/**
 * Play tuning, kept apart from the command so offline content validation
 * can reason about it without importing Prisma (the same reason
 * `starter-pack.ts` is its own module).
 */

/**
 * How long a specific toy stays boring to a specific companion.
 *
 * This is the limiter that replaces consuming the toy, and it binds a
 * player who visits often: at decay of 2/hour a single toy is genuinely
 * enough for someone dropping in every ninety minutes, and that is fine.
 * It does NOT bind a once-a-day visitor, whose real limit is how many
 * DIFFERENT toys they own — one play each, one visit. Sizing happiness
 * decay against that player (ADR-35) is what makes a small, varied toy
 * box the answer rather than an expensive one.
 */
export const PLAY_COOLDOWN_MINUTES = 90;

/**
 * Energy spent per play. Large enough that playing through a whole toy
 * box visibly tires a companion — at 4 against 5/hour of regeneration the
 * meter never moved at all, which made it a constant drawn as a dial —
 * and deliberately not a gate: a companion with no energy left still
 * plays and still gains the full happiness, the cost simply floors at
 * zero (CLAUDE.md — no energy gates on play).
 */
export const PLAY_ENERGY_COST = 10;
