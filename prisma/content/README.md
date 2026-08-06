# Content Authoring Guide

All game content is plain TypeScript data in this directory, organized by
domain and checked by `npm run content:validate` (offline — no database).
The expected workflow:

1. Open the relevant file below and add or edit a plain object.
2. `npm run content:validate` — every problem is reported in one run.
3. `npm run db:fresh` — guarded full reset + reseed of the dev database.
4. Open the game; the content is live.

No Prisma writes belong in these files, and no content arrays belong in
the seed orchestrator (`prisma/seed.ts`). Database synchronization lives
in `prisma/seed/` with an explicit policy per domain.

| File | Contents |
| --- | --- |
| `species/starter-species.ts` | Starter companions |
| `items/food.ts`, `items/toys.ts`, `items/curiosities.ts` | Item definitions |
| `items/categories.ts` | Display categories and descriptive tags |
| `world/dapplewood.ts` | Regions and locations |
| `shops/npc-shops.ts` | NPC shops, restock configs, stock pools |
| `shops/player-shop-upgrades.ts` | Player-shop capacity tiers |
| `daily/word-answers.ts` | Ordered daily word rotations (100 per difficulty) |
| `daily/prize-wheel.ts` | Wheel pools + versioned prize configuration |
| `daily/community-meal.ts` | Daily meal pool |
| `schemas/` | Zod contracts for all of the above |

## Commands

```sh
npm run content:validate  # offline validation, exits nonzero on problems
npm run db:reset          # guarded: drop + reapply schema (no seed)
npm run db:seed           # validate content, then synchronize it
npm run db:fresh          # reset + generate + seed + summary (one command)
```

Reset commands refuse to run when `NODE_ENV` is `production`, and refuse
non-local databases unless `DATABASE_DISPOSABLE=true` is set.

## How to…

**Add an item.** Append to the matching `items/*.ts` file:

```ts
{
  slug: "maple-butter-bun",
  name: "Maple Butter Bun",
  description: "Sticky in the way that makes friends.",
  type: "FOOD",              // "FOOD" | "TOY" | null (no use effect)
  category: "food",          // items/categories.ts slug
  tags: ["baked", "sweet"],
  price: 18n,                // bigint coins
  rarity: "COMMON",
  hungerRestore: 20,         // FOOD only
  artKey: "maple-butter-bun",
},
```

Non-stackable collectibles set `stackable: false` and, optionally, a
`provenancePolicy` (`"ORIGINAL_SOURCE"` or `"FULL_HISTORY"`).

**Add a food to the community meal pool.** The item must be an ACTIVE,
COMMON, stackable FOOD. Then in `daily/community-meal.ts`:

```ts
{ itemSlug: "maple-butter-bun", weight: 100 },
```

**Add an item to an NPC shop pool.** In `shops/npc-shops.ts`, inside the
shop's `pool`:

```ts
{ itemSlug: "maple-butter-bun", shopRarity: "COMMON", price: 18n, weight: 90, minQuantity: 4, maxQuantity: 10 },
```

Removing a pool entry deactivates it on the next seed (history stays).

**Create a region or location.** Add a location object to the region's
`locations` array in `world/` (or a new `world/<region>.ts` exported from
`world/index.ts`). `published: false` keeps it invisible until ready.

**Add a player-shop upgrade tier.** Append the next contiguous tier in
`shops/player-shop-upgrades.ts`; set `active: false` to stop new
purchases of a tier without touching existing owners.

**Append daily word answers.** Add words at the END of the difficulty's
array in `daily/word-answers.ts`. The array index is the sequence
position; each difficulty advances one answer per UTC game day from the
rotation epoch (`WORD_ROTATION_EPOCH` in
`src/server/modules/daily/word/config.ts`) and wraps after the last
active answer. Never insert or reorder existing entries — that renumbers
everything after the edit; intentional resequencing is a pre-alpha-only
move paired with a full `db:fresh`. To retire a word in place:

```ts
{ word: "MOSS", active: false },   // rotation skips it; frozen puzzles keep it
```

Each difficulty needs at least 100 configured AND 100 active answers
(`WORD_MIN_ACTIVE_ANSWERS`, a minimum rather than an exact count so words
can always be appended). Deactivating a word without appending a
replacement is a validation error — `npm run content:validate` reports
total and active counts per difficulty.

**Future answers may shift; created puzzles never do.** Adding,
deactivating, or (pre-alpha-only) resequencing answers changes which
answer future, not-yet-created puzzles will select — the rotation index
is derived from the active list at puzzle-creation time. That shifting is
expected and acceptable during pre-alpha. Existing `DailyWordPuzzle` rows
are frozen at creation and are never rewritten by content changes; only
`puzzle:regenerate` (future dates with zero player results) re-derives.

**Change wheel prizes or weights.** Configurations are IMMUTABLE once any
spin references them. Copy the `configuration` block in
`daily/prize-wheel.ts`, bump `version`, edit the copy. Weights are basis
points summing to exactly 10000. Icons are presentation-only and may be
edited in place.

**Deactivate content without deleting history.** Items: set
`lifecycle: "RETIRED"` (owned copies keep working) or `"DISABLED"` (kill
switch). Locations: `published: false`. Pool entries and word answers:
remove or mark inactive — the seed deactivates rows, never deletes them.

## Stable vs disposable

Keep stable: content slugs (they are public URLs and reference keys),
wheel configuration versions once played, word sequence positions once
appended. Disposable during pre-alpha: everything in the database —
accounts, inventories, puzzles, history — plus table/column names and the
migration sequence (see CLAUDE.md, Pre-Alpha Database and Compatibility
Policy).
