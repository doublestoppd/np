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
| `items/fish.ts`, `items/drinks.ts` | What comes out of the tarns, and what is on the stove |
| `fishing/tarnreach-waters.ts` | Fishing spots and the size ranges each water runs to |
| `shops/npc-shops.ts` | NPC shops, restock configs, stock pools |
| `shops/player-shop-upgrades.ts` | Player-shop capacity tiers |
| `daily/word-answers.ts` | Ordered daily word rotations (100 per difficulty) |
| `requests/hearth-kitchen.ts` | Request boards and their ordered requests |
| `daily/prize-wheel.ts` | Wheel pools + versioned prize configuration |
| `daily/community-meal.ts` | Daily meal pool |
| `daily/lantern-clues.ts` | Where the lantern can hide, and the riddle for each |
| `items/scratch-cards.ts` | The three salt chits and their prize tables |
| `items/tokens.ts` | The five Tumblehouse tokens and their drum tables |
| `items/books.ts` | The books, and what each is worth read aloud |
| `items/relics.ts` | The far end of the catalogue — scarce curios that do nothing |
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
`DAILY_WORD`, `DAILY_WHEEL`, `DAILY_MEAL`, `REQUEST_BOARD`, `FORAGING`,
`SORTING_BENCH`, `GIVEAWAY`, `LANTERN_HUNT`). Validation
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
`world/index.ts`). `published: false` keeps it invisible until ready. A
published location also needs a lantern clue — see the next entry.

**Add a fishing spot.** Append to `fishing/`. A spot's table is weighted
like a forage pool, but each entry also carries the LENGTH RANGE that
species runs to *in that water* — the same fish is meant to run bigger in
deeper places, and that difference is the only reason to prefer one water
over another. Fish must be stackable and ACTIVE. `emptyWeight` competes in
the same table as the fish rather than sitting on top of it; keep it high,
because a hook that always lands something is a vending machine.

**Add a daily giveaway pool.** A pool is a weighted list of items handed
out once per player per game day, and there can be more than one — the
claim row is scoped per pool (`daily/community-meal.ts` for the kitchen,
`daily/warming-hut.ts` for the drinks). Entries must be ACTIVE, stackable
FOOD. Attach it with a `DAILY_MEAL` or `DAILY_DRINK` activity.

**Change a scratch card's odds.** Edit `items/scratch-cards.ts`. Active
weights are basis points and must total exactly 10000 per card. The odds
are NOT shown to players (ADR-48) — the prize ladder is — so these are
free to be tuned without a copy change, and correspondingly easy to get
wrong unnoticed. `npm run content:validate` prints each card's expected
return as a percentage of its price, **including its jackpot slice**, and
fails if it reaches 100%: a card that pays its own way is a coin printer.
Most outcomes should be `NOTHING`; that is what pays for a top end worth
chasing. Validation also refuses a card that awards another card, a
furnishing, an inactive item, more than one of an instanced item, more
than one JACKPOT outcome, or a jackpot outcome on a card that does not
feed the pool. Removing an outcome deactivates it rather than deleting it,
because past scratches point at it.

**Change a token's drum table.** Edit `items/tokens.ts`. Same rules as a
scratch card — 10000 basis points, odds not published, expected return
must stay under the token price — plus one of its own: a tier's `faces`
count must equal its number of winning outcomes, and each winner owns a
distinct face. That is what keeps the published ladder complete by
construction rather than by remembering to keep it so. `npm run
content:validate` prints each tier's return *and* its losing share,
because those move independently: a tier can hold its return steady while
quietly becoming much meaner. Validation also refuses a tier with no
`NOTHING` outcome — every pull must be able to lose — and refuses one that
awards a token or a chit.

**Add a book.** Two entries: the item in `items/books.ts` with
`type: "BOOK"` and `category: "books"`, and a line in the `books` array
saying what it is worth read aloud. Validation refuses either half without
the other, because a BOOK item with no reading value is a book players can
buy and cannot read. Insight should rise with scarcity far more slowly
than price does — twenty cheap books beating one expensive one is the
ordering the feature is built on (ADR-50).

**Add a lantern hiding place.** Every PUBLISHED location needs exactly one
entry in `daily/lantern-clues.ts` — validation fails the build otherwise,
because a location with no riddle is somewhere the hunt can never send
anyone. The clue must be solvable from the location's own description,
must not name the place or its region, and should sound like the lantern
wrote it. `active: false` retires a riddle without deleting it: the
lantern stops hiding there and existing hunts keep their frozen reference.

**Add a player-shop upgrade tier.** Append the next contiguous tier in
`shops/player-shop-upgrades.ts`; set `active: false` to stop new
purchases of a tier without touching existing owners.

**Append daily word answers.** Add words at the END of the difficulty's
array in `daily/word-answers.ts`. The array index is the sequence
position. Which answer a player gets on a given day is drawn from the
difficulty's ACTIVE list by a keyed rotation (ADR-44) — 32 bands, each
with its own answer per day — so the list is a pool rather than a
schedule, and no position is "next". Never insert or reorder existing
entries — that renumbers
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
