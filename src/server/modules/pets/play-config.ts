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

/**
 * How long one grooming tool stays used-up for one companion (ADR-60).
 *
 * Longer than the play cooldown, and for a different reason. Play is a
 * thing you do repeatedly in a session; brushing is a thing you do once
 * and then it is done. Four hours means owning two or three tools covers
 * a coat falling at 1/hour comfortably, and owning one covers it if you
 * visit twice a day — so the answer is a small varied kit, exactly as it
 * is for toys, and never a subscription.
 */
export const GROOM_COOLDOWN_MINUTES = 240;

/**
 * Happiness a good brushing puts back, on top of the coat.
 *
 * Small. Grooming must not become a cheaper substitute for playing, or
 * the toy box stops mattering — this is the pleasure of being fussed
 * over, not entertainment.
 */
export const GROOM_HAPPINESS = 4;

/**
 * How long before sitting with a companion means anything again (ADR-61).
 *
 * Three hours, which is longer than the play cooldown on purpose. Sitting
 * costs nothing at all — no item, no coins, no cooldown on anything else —
 * so the only thing stopping it from being a button you hold down is this
 * number. At three hours a player who opens the game twice a day gets both
 * of them, and a player who opens it eleven times gets four.
 */
export const SIT_COOLDOWN_MINUTES = 180;

/**
 * Happiness a quiet half-hour puts back.
 *
 * Deliberately the smallest of the three. Eight sittings a day is 24
 * against 48 of decay, so company alone can never keep a companion in good
 * spirits — it always helps and it never replaces the toy box. The real
 * reward for sitting down is the bond, which is the point: the free thing
 * is emotionally central and mechanically minor.
 */
export const SIT_HAPPINESS = 3;
