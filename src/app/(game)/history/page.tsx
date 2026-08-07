import type { Metadata } from "next";
import type { TransactionType } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { playerHistory } from "@/server/modules/commerce/history";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { cursorSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "History" };

const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

const TYPE_LABELS: Record<TransactionType, { label: string; tone: BadgeTone }> = {
  STARTER_GRANT: { label: "Starter pack", tone: "success" },
  ITEM_USE: { label: "Care", tone: "neutral" },
  NPC_PURCHASE: { label: "Shop purchase", tone: "accent" },
  PLAYER_LISTING_REPRICE: { label: "Price changed", tone: "neutral" },
  PLAYER_LISTING_CREATE: { label: "Listed", tone: "neutral" },
  PLAYER_LISTING_CANCEL: { label: "Cancelled", tone: "neutral" },
  PLAYER_SALE: { label: "Sale", tone: "success" },
  PLAYER_PURCHASE: { label: "Bought", tone: "accent" },
  PROCEEDS_CLAIM: { label: "Till claim", tone: "success" },
  CAPACITY_UPGRADE: { label: "Upgrade", tone: "accent" },
  ADMIN_ADJUST: { label: "Adjustment", tone: "warning" },
  DAILY_WORD_REWARD: { label: "Word puzzle", tone: "success" },
  DAILY_WHEEL_PRIZE: { label: "Prize wheel", tone: "success" },
  DAILY_FOOD_CLAIM: { label: "Daily meal", tone: "success" },
  REQUEST_REWARD: { label: "Request", tone: "success" },
  RANDOM_EVENT: { label: "Chance find", tone: "success" },
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const { cursor } = cursorSchema.parse({ cursor: firstParam(params.cursor) });

  const { entries, nextCursor } = await playerHistory(prisma, user.id, {
    cursor,
  });

  return (
    <>
      <PageHeader
        title="History"
        description="Your ledger: purchases, sales, listings, claims, and care."
        actions={
          <>
            <LinkButton href="/history/daily" variant="secondary">
              Daily activities
            </LinkButton>
            <LinkButton href="/history/events" variant="secondary">
              Chance findings
            </LinkButton>
          </>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          icon="📖"
          title="Nothing yet"
          description="Your economic adventures will be recorded here."
        />
      ) : (
        <Surface padded={false}>
          <ul className="divide-y divide-border">
            {entries.map((entry) => {
              const presentation = TYPE_LABELS[entry.type];
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm"
                >
                  <Badge tone={presentation.tone} className="shrink-0">
                    {presentation.label}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    {entry.note ?? entry.item?.name ?? entry.type}
                    {entry.counterparty && (
                      <>
                        {" "}
                        <TextLink href={`/u/${entry.counterparty.username}`}>
                          {entry.counterparty.username}
                        </TextLink>
                      </>
                    )}
                  </span>
                  {entry.coinsDelta !== 0n && (
                    <CurrencyAmount
                      amount={entry.coinsDelta}
                      delta
                      compact
                      className="shrink-0 font-semibold"
                    />
                  )}
                  <span className="shrink-0 text-xs text-text-muted">
                    {DATE_FORMAT.format(entry.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}

      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <LinkButton
            href={`/history?cursor=${encodeURIComponent(nextCursor)}`}
            variant="quiet"
          >
            Older entries
          </LinkButton>
        </div>
      )}
    </>
  );
}
