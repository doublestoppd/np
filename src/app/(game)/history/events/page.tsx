import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getRandomEventHistory } from "@/server/modules/events/queries";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { coinsFromJSON } from "@/lib/money";
import { cursorSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Chance findings" };

/**
 * The log of random events.
 *
 * This is not decoration. A roll commits server-side before the response
 * reaches the browser, so a connection dropped at the wrong moment can
 * leave a player rewarded and never told. This page is where they check.
 * Everything shown is the frozen payload written at the time, so it also
 * stays accurate after the catalog is retuned.
 */

const RARITY_META: Record<string, { label: string; tone: BadgeTone }> = {
  common: { label: "Common", tone: "neutral" },
  uncommon: { label: "Uncommon", tone: "accent" },
  rare: { label: "Rare", tone: "success" },
  legendary: { label: "Extraordinary", tone: "warning" },
};

const CATEGORY_ICONS: Record<string, string> = {
  discovery: "🍂",
  companion: "🐾",
  mishap: "🎩",
  grove: "🌿",
};

const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function RandomEventHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const { cursor } = cursorSchema.parse({ cursor: firstParam(params.cursor) });

  const { entries, nextCursor } = await getRandomEventHistory(prisma, {
    userId: user.id,
    cursor,
  });

  return (
    <>
      <PageHeader
        title="Chance findings"
        description="Things that happened to you while you were on your way somewhere else."
        backHref="/history"
        actions={
          <LinkButton href="/history/daily" variant="secondary">
            Daily activities
          </LinkButton>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          icon="🍂"
          title="Nothing has happened yet"
          description="Wander the grove and something will, sooner or later. It always does."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => {
            const rarity = RARITY_META[entry.rarity] ?? RARITY_META.common;
            const coins = coinsFromJSON(entry.coinsAwarded);
            return (
              <Surface as="li" key={entry.id} density="compact">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="text-lg">
                    {CATEGORY_ICONS[entry.category] ?? "🌿"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={rarity?.tone ?? "neutral"}>
                        {rarity?.label ?? "Common"}
                      </Badge>
                      <span className="text-xs text-text-muted">
                        {DATE_FORMAT.format(entry.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{entry.title}</p>
                    <p className="mt-0.5 text-sm text-text-muted">
                      {entry.message}
                    </p>
                    {(coins > 0n || entry.rewardSummary !== "") && (
                      <p className="mt-1 text-xs text-text-muted">
                        {coins > 0n ? (
                          <>
                            Received <CurrencyAmount amount={coins} compact />
                            {entry.effects.some((e) => e.kind === "item") && " · "}
                          </>
                        ) : null}
                        {entry.effects
                          .filter((effect) => effect.kind === "item")
                          .map((effect) =>
                            effect.kind === "item"
                              ? `${effect.name}${effect.quantity > 1 ? ` ×${effect.quantity}` : ""}`
                              : "",
                          )
                          .join(", ")}
                      </p>
                    )}
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
            href={`/history/events?cursor=${encodeURIComponent(nextCursor)}`}
            variant="quiet"
          >
            Older findings
          </LinkButton>
        </div>
      )}
    </>
  );
}
