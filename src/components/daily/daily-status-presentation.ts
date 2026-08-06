import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * Maps raw daily-activity states onto the shared player status vocabulary
 * plus domain copy. Pure so the dashboard panel's behavior is unit-tested.
 */
export interface PanelStatus {
  status: PlayerStatus;
  label: string;
}

export function wordPanelStatus(completedCount: number): PanelStatus {
  if (completedCount >= 3) {
    return { status: "COMPLETED", label: "Done for today" };
  }
  if (completedCount > 0) {
    return { status: "IN_PROGRESS", label: `${completedCount}/3 done` };
  }
  return { status: "AVAILABLE", label: "Available" };
}

export function wheelPanelStatus(
  wheel: "AVAILABLE" | "COMPLETED",
): PanelStatus {
  return wheel === "COMPLETED"
    ? { status: "COMPLETED", label: "Spun today" }
    : { status: "AVAILABLE", label: "Available" };
}

export function mealPanelStatus(meal: "AVAILABLE" | "CLAIMED"): PanelStatus {
  return meal === "CLAIMED"
    ? { status: "CLAIMED", label: "Claimed today" }
    : { status: "AVAILABLE", label: "Available" };
}
