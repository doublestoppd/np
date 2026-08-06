import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { getDailyStatus } from "@/server/modules/daily/status";
import {
  dailyLocationPath,
  MEAL_LOCATION_SLUG,
  WHEEL_LOCATION_SLUG,
  WORD_LOCATION_SLUG,
} from "@/server/modules/daily/locations";
import {
  mealPanelStatus,
  wheelPanelStatus,
  wordPanelStatus,
} from "@/components/daily/daily-status-presentation";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";

export const metadata: Metadata = { title: "Games" };

/**
 * Everything playable today, in one place. The activities live at their
 * locations in the world — this page is a directory into them, so a
 * player looking for something to play never lands on a dead end.
 */
export default async function GamesPage() {
  const user = await requireUser();
  const daily = await getDailyStatus(prisma, {
    userId: user.id,
    gameDate: currentGameDate(),
  });

  const games = [
    {
      href: dailyLocationPath(WORD_LOCATION_SLUG),
      icon: "🔤",
      name: "Daily Word Challenge",
      place: "Whisperleaf Reading Room",
      description:
        "Three puzzles a day at four, five, and six letters. Five guesses each.",
      ...wordPanelStatus(daily.wordCompleted),
    },
    {
      href: dailyLocationPath(WHEEL_LOCATION_SLUG),
      icon: "🎡",
      name: "Daily Prize Wheel",
      place: "Brassbell Pavilion",
      description: "One spin a day for coins or curiosities.",
      ...wheelPanelStatus(daily.wheel),
    },
    {
      href: dailyLocationPath(MEAL_LOCATION_SLUG),
      icon: "🥣",
      name: "Community Requests",
      place: "Hearth and Ladle",
      description:
        "Deliver what the kitchen asks for. A few requests a day, no rush.",
      ...mealPanelStatus(daily.meal),
    },
  ];

  return (
    <>
      <PageHeader
        title="Games"
        description="What there is to play today. Everything resets at midnight UTC."
      />

      <ul className="flex flex-col gap-2">
        {games.map((game) => (
          <Surface as="li" key={game.href} padded={false}>
            <Link
              href={game.href}
              className="flex min-h-11 items-start gap-3 rounded-surface p-3 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span aria-hidden="true" className="text-xl">
                {game.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{game.name}</span>
                  <StatusBadge status={game.status} label={game.label} />
                </span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  {game.place}
                </span>
                <span className="mt-1 block text-sm text-text-muted">
                  {game.description}
                </span>
              </span>
            </Link>
          </Surface>
        ))}
      </ul>

      <p className="mt-4 text-sm text-text-muted">
        More to play will appear here as the grove grows. Past results live
        in your <TextLink href="/history/daily">activity history</TextLink>.
      </p>
    </>
  );
}
