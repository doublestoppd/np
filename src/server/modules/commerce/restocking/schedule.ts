import type { NpcShopRestockConfig } from "@prisma/client";

/**
 * Per-shop anchored schedules (docs/conventions.md): windows are
 * anchorAt + k * intervalMinutes, so shops with the same interval restock
 * at independent times. Schedules stay hidden from players — never render
 * or expose window math client-side.
 */
export function computeWindowStart(
  config: Pick<NpcShopRestockConfig, "intervalMinutes" | "anchorAt">,
  now: Date,
): Date | null {
  const intervalMs = config.intervalMinutes * 60_000;
  if (intervalMs <= 0) {
    return null;
  }
  const elapsed = now.getTime() - config.anchorAt.getTime();
  if (elapsed < 0) {
    // The schedule hasn't started yet.
    return null;
  }
  return new Date(
    config.anchorAt.getTime() + Math.floor(elapsed / intervalMs) * intervalMs,
  );
}
