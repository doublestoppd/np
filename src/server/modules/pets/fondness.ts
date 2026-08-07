import type { DbTx } from "@/server/db";

/**
 * Records that a companion turned out to love something.
 *
 * Transaction-scoped and never opens its own, like every other helper
 * under modules/. Written at most once per (pet, item): the row is a
 * "this happened", not a tally, so a second helping of the same thing adds
 * nothing and the unique index makes two simultaneous first helpings
 * converge instead of colliding.
 */
export async function rememberDelight(
  tx: DbTx,
  { petId, itemId, now }: { petId: string; itemId: string; now: Date },
): Promise<void> {
  await tx.petDelight.createMany({
    data: [{ petId, itemId, firstAt: now }],
    skipDuplicates: true,
  });
}
