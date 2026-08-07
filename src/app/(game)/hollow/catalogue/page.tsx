import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { listCatalogue } from "@/server/modules/hollow/queries";
import { buyFurnishingAction } from "@/server/actions/hollow";
import { FurnishingArt } from "@/components/art/hollow-art";
import { GROWTH_STAGES } from "@/server/modules/hollow/config";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FilterBar } from "@/components/ui/filter-bar";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { coinsFromJSON } from "@/lib/money";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Furnishings" };

/**
 * The furnishings catalogue.
 *
 * Deliberately absent, and to be kept absent: any total, any owned-count
 * over a denominator, any percentage, any "new" or "featured" flag, and any
 * rarity. Everything is buyable by anybody at a fixed price forever, and
 * the list is sorted by price and nothing else — so there is nothing to
 * complete and nothing to beat, only things to want.
 */
const FACETS = [
  { value: "", label: "Everything" },
  { value: "stone", label: "Stone" },
  { value: "wood", label: "Wood" },
  { value: "metal", label: "Metal" },
  { value: "glass", label: "Glass" },
  { value: "water", label: "Water" },
  { value: "lit", label: "Lit" },
  { value: "growing", label: "Growing" },
];

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const tag = firstParam(params.tag);
  const entries = await listCatalogue(prisma, {
    userId: user.id,
    tag: tag && tag !== "" ? tag : undefined,
  });

  return (
    <>
      <PageHeader
        title="Furnishings"
        description="Things to stand about your Hollow. Buy the same one as many times as you like — three stones make a path."
        backHref="/hollow"
        backLabel="Your Hollow"
      />
      <FeedbackBanner
        notice={firstParam(params.notice)}
        error={firstParam(params.error)}
      />

      <FilterBar action="/hollow/catalogue">
        <label className="sr-only" htmlFor="tag">
          Made of
        </label>
        <Select id="tag" name="tag" defaultValue={tag ?? ""}>
          {FACETS.map((facet) => (
            <option key={facet.value} value={facet.value}>
              {facet.label}
            </option>
          ))}
        </Select>
        <SubmitButton variant="secondary" pendingLabel="Looking…">
          Show
        </SubmitButton>
      </FilterBar>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {entries.map((entry) => (
          <Surface as="li" key={entry.slug} className="flex flex-col">
            <div className="flex gap-3">
              <div className="w-20 shrink-0 min-[360px]:w-24">
                <ArtworkFrame aspect="square">
                  <FurnishingArt
                    artKey={entry.artKey}
                    size={entry.size}
                    stage={GROWTH_STAGES - 1}
                    stages={GROWTH_STAGES}
                    label=""
                  />
                </ArtworkFrame>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-semibold">{entry.name}</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {entry.description}
                </p>
                {entry.growthDays !== null && (
                  <p className="mt-1 text-xs text-text-muted">
                    Finishes growing about {entry.growthDays} days after you
                    set it down.
                  </p>
                )}
                {/* State, never a tally: "in your keeping" and how many are
                    spare. There is no denominator anywhere on this page. */}
                {entry.owned > 0 && (
                  <p className="mt-1 text-xs text-text-muted">
                    {entry.owned === 1
                      ? "One in your keeping"
                      : `${entry.owned} in your keeping`}
                    {entry.owned > entry.placed
                      ? `, ${entry.owned - entry.placed} not standing anywhere`
                      : ""}
                    .
                  </p>
                )}
              </div>
            </div>
            <form action={buyFurnishingAction} className="mt-3">
              <IdempotencyField />
              <input type="hidden" name="slug" value={entry.slug} />
              <input type="hidden" name="quantity" value="1" />
              <SubmitButton variant="secondary" pendingLabel="Buying…">
                Buy — <CurrencyAmount amount={coinsFromJSON(entry.price)} compact />
              </SubmitButton>
            </form>
          </Surface>
        ))}
      </ul>
    </>
  );
}
