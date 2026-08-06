import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getDailyHistory } from "@/server/modules/daily/history";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { cursorSchema } from "@/lib/validation";
import { formatCoins, coinsFromJSON } from "@/lib/money";

export const metadata: Metadata = { title: "Daily activity history" };

const ACTIVITY_META: Record<
  "WORD" | "WHEEL" | "MEAL",
  { label: string; tone: BadgeTone; icon: string }
> = {
  WORD: { label: "Word puzzle", tone: "accent", icon: "🔤" },
  WHEEL: { label: "Prize wheel", tone: "success", icon: "🎡" },
  MEAL: { label: "Meal", tone: "neutral", icon: "🥣" },
};

const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

export default async function DailyHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const { cursor } = cursorSchema.parse({ cursor: firstParam(params.cursor) });

  const { entries, nextCursor } = await getDailyHistory(prisma, {
    userId: user.id,
    cursor,
  });

  return (
    <>
      <PageHeader
        title="Daily activities"
        description="Your word puzzles, wheel spins, and meals — day by day."
        actions={
          <>
            <LinkButton href="/history" variant="secondary">
              Full ledger
            </LinkButton>
            <LinkButton href="/history/events" variant="secondary">
              Chance findings
            </LinkButton>
          </>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          icon="🗓️"
          title="No daily activities yet"
          description="Puzzles, spins, and meals you complete will show up here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => {
            const meta = ACTIVITY_META[entry.activity];
            const coins = coinsFromJSON(entry.coinsAwarded);
            return (
              <Surface as="li" key={`${entry.activity}-${entry.id}`} density="compact">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="text-lg">
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {entry.difficulty && (
                        <span className="text-xs text-text-muted">
                          {DIFFICULTY_LABELS[entry.difficulty] ?? entry.difficulty}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">
                        {entry.gameDate}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{entry.outcome}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {entry.attemptsUsed !== null &&
                        `${entry.attemptsUsed} ${entry.attemptsUsed === 1 ? "guess" : "guesses"} used`}
                      {entry.attemptsUsed !== null &&
                        (coins > 0n || entry.itemName) &&
                        " · "}
                      {coins > 0n && `${formatCoins(coins)} coins`}
                      {coins > 0n && entry.itemName && " · "}
                      {entry.itemName &&
                        `${entry.itemName}${(entry.itemQuantity ?? 1) > 1 ? ` ×${entry.itemQuantity}` : ""}`}
                    </p>
                  </div>
                </div>
              </Surface>
            );
          })}
        </ul>
      )}

      {nextCursor && (
        <div className="mt-4 text-center">
          <LinkButton
            href={`/history/daily?cursor=${encodeURIComponent(nextCursor)}`}
            variant="quiet"
          >
            Older activity
          </LinkButton>
        </div>
      )}
    </>
  );
}
