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
| `items/furnishings.ts` | Things you stand in a Hollow |
| `hollow/grounds.ts` | Painted grounds, their eight anchors, and the ground price ladder |
| `hollow/airs.ts` | The light a ground is seen in |
| `items/categories.ts` | Display categories and descriptive tags |
| `world/dapplewood.ts` | Regions and locations |
| `shops/npc-shops.ts` | NPC shops, restock configs, stock pools |
| `shops/player-shop-upgrades.ts` | Player-shop capacity tiers |
| `daily/word-answers.ts` | Ordered daily word rotations (100 per difficulty) |
| `requests/hearth-kitchen.ts` | Request boards and their ordered requests |
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

**Add a furnishing.** Append to `items/furnishings.ts`. It is an ordinary
item with a `furnishing` block, and validation enforces the rules that keep
the Hollow a sink rather than a checklist (ADR-39): `type: null`,
`tradeable: false`, `rarity: "COMMON"`, stackable, and available from
nowhere else in the game — not a shop pool, the wheel, the meal, a forage
spot, a request board, or the starter pack.

```ts
{
  slug: "long-bench",
  name: "Long Bench",
  description: "Seats four, or one person four times over an afternoon.",
  type: null,
  category: "furnishings",
  tags: ["wood", "standing"],
  price: 1_800n,
  rarity: "COMMON",
  tradeable: false,
  artKey: "long-bench",
  furnishing: { size: "MEDIUM" },   // + growthDays for something that grows
},
```

`size` says what fits where and is never a rank. `growthDays` starts a
clock that only real time advances; leave it off for a finished object.

**Add a ground.** Append to `hollow/grounds.ts` with exactly eight anchors,
exactly one of them `CENTREPIECE`, unique anchor keys and unique depths,
then add a matching rung to `hollowGroundPrices` — the ladder needs one
rung per ground, and rung 0 must be free. Anchor keys are stable content:
renaming one drops whatever was standing there.

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

**Attach an activity to a location.** Locations declare what can be done
there, in display order. The activity's configuration lives in its own
domain file; the attachment only references it by key:

```ts
{
  slug: "hearth-and-ladle",
  name: "Hearth and Ladle",
  // …
  activities: [
    { type: "DAILY_MEAL", activityKey: "hearth-and-ladle", displayOrder: 10, active: true },
    { type: "REQUEST_BOARD", activityKey: "hearth-kitchen-requests", displayOrder: 20, active: true },
  ],
},
```

Valid types are the `LocationActivityType` enum values (`NPC_SHOP`,
`DAILY_WORD`, `DAILY_WHEEL`, `DAILY_MEAL`, `REQUEST_BOARD`). Validation
checks that the key resolves, that an NPC shop is attached to its own
location, that display orders are unique within a location, and that the
three daily anchors keep their attachments. Removing an attachment
deactivates the row rather than deleting it, so history survives.

**Author a request board.** A board is an ordered list of item-delivery
requests. Each player works through them independently, wrapping after the
last active one; nothing expires.

```ts
export const hearthKitchenRequestBoard = {
  key: "hearth-kitchen-requests",
  name: "Community Requests",
  description: "The kitchen has posted a few practical needs.",
  active: true,
  dailyCompletionLimit: 3,          // completions per player per UTC day
  requests: [
    {
      slug: "biscuit-basket",
      sequencePosition: 0,           // contiguous from 0, never reordered
      title: "A Basket for the Morning Table",
      flavorText: "The basket is present. Its contents have been less cooperative.",
      requirements: [{ itemSlug: "honey-oat-biscuit", quantity: 2 }],
      rewardCoins: 90n,
      active: true,
    },
  ],
} satisfies RequestBoardContent;
```

Balancing rules the validator enforces: rewards must be positive;
requirements must be ACTIVE, stackable items (instanced items would make
the consumed copy ambiguous); no duplicate item in one request; positions
contiguous from 0; at least one active request on an active board. It
also fails on **guaranteed arbitrage** — a reward exceeding what the
requirements cost to buy from an NPC shop would mint coins. Requirements
drawn from daily-meal foods have no purchase route at all, which is why
the shipped board uses them. `npm run content:validate` prints a balance
line per request (requirements, reference value, NPC cost, reward,
margin).

The daily cap protects the economy without punishing anyone: reaching it
never removes the assigned request, it only defers completion to the next
UTC game day. Retiring a request (`active: false`) hides it from future
assignment but leaves it frozen for any player who already has it.

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
