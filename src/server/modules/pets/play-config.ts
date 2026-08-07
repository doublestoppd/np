/**
 * Play tuning, kept apart from the command so offline content validation
 * can reason about it without importing Prisma (the same reason
 * `starter-pack.ts` is its own module).
 */

/**
 * How long a specific toy stays boring to a specific companion.
 *
 * This is the limiter that replaces consuming the toy. Long enough that
 * one plaything cannot hold happiness up on its own — decay is 3/hour, so
 * a single toy at the shipped boosts covers well under half of it — and
 * short enough that a small collection genuinely keeps a companion in good
 * spirits. Owning several different toys is the intended answer, which is
 * why they are worth buying and keeping rather than burning.
 */
export const PLAY_COOLDOWN_MINUTES = 90;

/**
 * Energy spent per play. Deliberately smaller than the happiness gained,
 * and deliberately not a gate: a companion with no energy left still
 * plays and still gains the full happiness, the cost simply floors at zero
 * (CLAUDE.md — no energy gates on play).
 */
export const PLAY_ENERGY_COST = 4;
