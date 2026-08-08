import Link from "next/link";
import type { ActivityDirectoryEntry } from "@/server/modules/directory/activity-directory";
import { activityPanelStatus } from "./daily-status-presentation";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tint } from "@/lib/content-tint";
import { Surface } from "@/components/ui/surface";

/**
 * The one rendering of "what there is to do today", shared by the home
 * dashboard and /games. Both used to build this list by hand, and the two
 * copies had drifted apart: the same link carried two different names, one
 * card showed another activity's status, and the request board appeared on
 * neither.
 *
 * `showDescription` is the only difference between the two surfaces — the
 * dashboard is a glance, the directory is a browse.
 */
const ICONS: Record<ActivityDirectoryEntry["type"], string> = {
  DAILY_WORD: "🔤",
  DAILY_WHEEL: "🎡",
  DAILY_MEAL: "🥣",
  REQUEST_BOARD: "📋",
  NPC_SHOP: "🏪",
  FORAGING: "🧺",
  SORTING_BENCH: "🫙",
  GIVEAWAY: "🪵",
  LANTERN_HUNT: "🏮",
  FISHING: "🎣",
  DAILY_DRINK: "🍵",
  MATCHING_GAME: "🪨",
  SLOT_MACHINE: "🎰",
  SUDOKU: "🔢",
  CAVE_DELVE: "🕳️",
};

/**
 * A hue per kind of thing to do.
 *
 * "Today's activities" is the first list a player reads every session, and
 * it was six identical rows: same card, same green chip, distinguishable
 * only by reading. A tinted disc behind each icon makes the list scannable
 * at a glance and gives the home page the one thing it most lacked — a
 * reason for any colour to be there at all.
 */
const TINTS: Record<ActivityDirectoryEntry["type"], Tint> = {
  DAILY_WORD: "dusk",
  DAILY_WHEEL: "berry",
  DAILY_MEAL: "ember",
  REQUEST_BOARD: "honey",
  NPC_SHOP: "ember",
  FORAGING: "moss",
  SORTING_BENCH: "tide",
  LANTERN_HUNT: "honey",
  FISHING: "tide",
  DAILY_DRINK: "ember",
  MATCHING_GAME: "dusk",
  GIVEAWAY: "moss",
  SLOT_MACHINE: "berry",
  SUDOKU: "tide",
  CAVE_DELVE: "dusk",
};

/** Soft disc backgrounds, spelled out so Tailwind keeps the classes. */
const DISCS: Record<Tint, string> = {
  berry: "bg-tint-berry-soft",
  ember: "bg-tint-ember-soft",
  honey: "bg-tint-honey-soft",
  moss: "bg-tint-moss-soft",
  tide: "bg-tint-tide-soft",
  dusk: "bg-tint-dusk-soft",
};

export function ActivityDirectoryList({
  entries,
  showDescription = false,
}: {
  entries: ActivityDirectoryEntry[];
  showDescription?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => {
        const status = activityPanelStatus(entry.availability);
        return (
          <Surface as="li" key={entry.key} padded={false}>
            <Link
              href={entry.href}
              className="flex min-h-11 items-start gap-3 rounded-surface p-3 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span
                aria-hidden="true"
                className={`flex size-9 shrink-0 items-center justify-center rounded-full text-lg ${DISCS[TINTS[entry.type]]}`}
              >
                {ICONS[entry.type]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{entry.name}</span>
                  <StatusBadge status={status.status} label={status.label} />
                </span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  {entry.place}
                </span>
                {showDescription && (
                  <span className="mt-1 block text-sm text-text-muted">
                    {entry.description}
                  </span>
                )}
              </span>
            </Link>
          </Surface>
        );
      })}
    </ul>
  );
}
