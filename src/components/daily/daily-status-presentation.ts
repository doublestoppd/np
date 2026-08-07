import type { ActivityAvailability } from "@/server/modules/directory/activity-directory";
import type { PlayerStatus } from "@/components/ui/status-badge";

/**
 * Maps an activity's domain availability onto the shared player status
 * vocabulary. Pure, so the dashboard panel's behavior is unit-tested, and
 * single, so the home dashboard and /games can never label the same
 * activity differently.
 */
export interface PanelStatus {
  status: PlayerStatus;
  label: string;
}

export function activityPanelStatus(
  availability: ActivityAvailability,
): PanelStatus {
  switch (availability.kind) {
    case "UNAVAILABLE":
      return { status: "UNAVAILABLE", label: "Closed today" };
    case "DONE":
      return {
        status: "COMPLETED",
        label: availability.label ?? "Done for today",
      };
    case "IN_PROGRESS":
      return {
        status: "IN_PROGRESS",
        label: `${availability.done}/${availability.total} done`,
      };
    case "AVAILABLE":
      return { status: "AVAILABLE", label: "Available" };
  }
}
