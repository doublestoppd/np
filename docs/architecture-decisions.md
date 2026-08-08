# Architecture Decisions

Short records of consequential decisions. Add an entry when a choice will
constrain future work; keep entries honest about trade-offs.

## ADR-1: `Item.type` becomes a nullable use-effect discriminator

**Decision.** Keep the `ItemType` enum (`FOOD`, `TOY`) but make the column
nullable and redefine its meaning: it discriminates *typed gameplay use
effects*, not display categories. `null` = no use effect. Display
categorization moves to a data-driven `ItemCategory` relation; descriptive
attributes move to `ItemTag` (many-to-many).

**Alternatives considered.**
- *Growing the enum per category* (rejected: every ordinary possession kind
  would force a migration, exactly the failure mode this phase removes).
- *Adding a `NONE` enum value* (rejected: pollutes a mechanics enum with a
  non-mechanic and still requires a migration now; nullable is the smaller,
  more honest change).
- *Free-form string categories on Item* (rejected: no integrity, no place
  for category metadata like sort order or descriptions).
- *JSON effect blobs* (rejected: economy and pet-stat rules must stay typed
  and validated; JSON invites an accidental scripting engine).

**Why this extends better.** New possession kinds are seed rows. The enum
only grows when a real mechanic ships — which needs service code and tests
regardless, so the migration is not marginal cost. Feeding still checks
`type === "FOOD"` and reads the typed `hungerRestore` column, so existing
behavior and tests survive unchanged.

**Limitations.** Two categorization axes (category + tags) can drift into
overlap; convention: exactly one category per item, tags for everything else.

## ADR-2 (superseded by ADR-23): Database CHECK constraints via raw SQL in migrations

> **Superseded in part.** ADR-23 squashed the development migration
> history into a single `0_init`, so the `phase1_foundation` migration
> named below no longer exists and the constraint list here is a small
> sample of the roughly forty-five CHECKs now in
> `prisma/migrations/0_init/migration.sql`. The *decision* — invariants
> the ORM cannot express live in the database, written as raw SQL in
> migrations — stands unchanged; only the file names are historical.

**Decision.** Prisma does not model CHECK constraints, so the
`phase1_foundation` migration adds them as hand-written SQL:
non-negative `InventoryEntry.quantity`, `Item.price`, and
`ShowcaseEntry.position`. The same migration backfills the new
`Item.artKey` column (from `slug`) before setting it NOT NULL, because
production-style databases already contain seeded rows.

**Consequences.** `prisma migrate dev` was run with `--create-only` and the
SQL edited before applying — this is the documented pattern for any future
migration needing backfills or constraints. Integration tests assert the
constraints actually reject bad rows, so schema drift in a fresh environment
would surface as a test failure.

## ADR-3: `Profile` is a separate 1:1 model, not columns on `User`

**Decision.** Public-facing fields (bio, title, featuredPetId) live in a
`Profile` model created lazily on first edit. `User` keeps authentication
and economy fields only.

**Why.** Public reads select from a model that contains nothing secret,
making it structurally hard to leak `passwordHash` or session data through a
careless include; profile growth (avatars, layout choices) won't widen the
auth-critical table. **Alternative:** columns on `User` (rejected: cheaper
now, riskier every time the public surface grows). **Limitation:** readers
must handle a missing profile (defaults are applied in the service).

## ADR-4 (partly superseded by ADR-26): Showcase entries are ordered references with read-time filtering

> **Superseded in part.** ADR-26 added `@@unique([userId, position])` as
> defence in depth alongside the per-user advisory lock, so the claim
> below that there is deliberately no unique constraint on that pair is no
> longer true. Read-time filtering and service-owned ordering stand.

**Decision.** `ShowcaseEntry(userId, itemId, position)` with a per-user
unique on `itemId`, capacity 6 enforced in the service, ordering normalized
by transactional rewrites. Ownership is validated on write; reads join
current inventory and hide entries with zero owned quantity; stale entries
are pruned on the player's next edit. No unique constraint on
`(userId, position)` — ordering integrity belongs to the service, which
rewrites positions atomically, avoiding constraint gymnastics during swaps.

**Alternative:** cascade-delete showcase entries when quantity hits zero
(rejected: inventory mutation paths — feeding today, more later — would all
need showcase knowledge; read-time filtering keeps that concern in one
place). **Limitation:** hidden-but-unpruned rows exist until the next edit;
they are invisible to all readers and harmless.

## ADR-5: World content is data with publication flags

**Decision.** `Region` and `Location` rows (slug, name, description, artKey,
sortOrder, published) seeded idempotently; Explore and location pages read
only published content through the world module (now
`src/server/modules/world/world.ts`, see ADR-21). A location is
public only if its region is also published.

**Why.** Removes hardcoded UI arrays, gives future content a staging state,
and adds the anchor points (region/location ids) that NPCs, shops, seasons,
weather, events, and discoverables will reference later — without creating
those models now. **Limitation:** no hierarchy deeper than region → location
until something needs it.

## ADR-6: Design tokens live in Tailwind v4 `@theme`

**Decision.** All semantic tokens (colors, fonts, radii, shadow, easing) are
CSS custom properties in `src/app/globals.css`, consumed as Tailwind
utilities (`bg-surface`, `text-text-muted`, `rounded-surface`…). Shared UI
primitives in `src/components/ui/` are the only place component styling
patterns are defined; screens compose primitives.

**Why.** One file re-skins the game when the final palette lands; no
`tailwind.config` divergence (v4 is CSS-first); no runtime CSS-in-JS
dependency. Light theme only this phase (per product direction). Stat colors
are also tokens so data-viz hues stay replaceable.

## ADR-7: Playwright added for critical browser flows

**Decision.** `@playwright/test` (devDependency) with a 360×740 mobile
project, a production-server `webServer`, and one core-journey spec
(sign-up → starter → home → inventory → profile edit → showcase → public
profile). The execution environment provides a preinstalled Chromium
(`PLAYWRIGHT_BROWSERS_PATH`); the config falls back to that binary when the
default resolution cannot find a browser. CLAUDE.md already named Playwright
as the browser-flow tool; this makes it real.

**Limitations.** E2E runs against the development database (tests create
uniquely named users and only add data); `npm run build` must run first;
fresh machines need `npx playwright install chromium` once.

## ADR-8: No route-level `loading.tsx` in the game shell (for now)

**Decision.** The authenticated route group has no `loading.tsx`. Pending
feedback for server actions comes from `SubmitButton` (useFormStatus); the
`Skeleton` primitive stays in the design system for targeted use.

**Why.** Empirically (Next.js 15.5): with a route-group `loading.tsx`
present, submitting a second server action from a page that a previous
action had just `redirect()`ed back to (same route, after `revalidatePath`)
wedges the client router — the POST never settles and the UI hangs in its
pending state. Removing the loading boundary eliminates the hang completely
(reproduced and verified via the Playwright core-journey suite, which fails
deterministically with the file and passes deterministically without it).
The profile editor's save-then-add-showcase flow hits exactly this pattern.
Revisit on future Next.js upgrades; if a route skeleton becomes important,
scope `loading.tsx` to action-free routes (e.g. explore) or re-test this
repro first.

## ADR-9: One extended ledger, not a parallel EconomyTransaction model

**Decision.** Phase 2 extends the existing `Transaction` model (counterparty,
instance/stock/listing/restock references, metadata, new type values)
instead of adding a second ledger table. User-facing history and audit
investigation read one table; care activity and commerce share indexes.
Ledger-adjacent foreign keys switched from `Cascade` to `Restrict` so no
cascade can destroy history — account deletion now requires an explicit
archival procedure (docs/operations.md). **Alternative:** a separate
`EconomyTransaction` (rejected: two half-ledgers, duplicated read paths).
**Consequence:** test cleanup must delete transactions before users.

## ADR-10: Deterministic restocks anchored by a unique window row

**Decision.** A restock plan is a pure function of (shopId, windowStart,
server secret): HMAC-SHA256 seeds a counter-mode SHA-256 PRNG; pool entries
are sorted by slug before weighted selection so database row order can't
change results. Execution takes a per-shop Postgres advisory lock and the
`(shopId, windowStart)` unique constraint anchors idempotency; scheduler,
lazy fallback, retries, and concurrent calls all converge on one COMPLETED
record. Stock replacement happens inside one transaction (expire all +
insert all), so readers never see an empty between-state. The secret is
never stored; audits keep a derived `seedId` and a full result summary.
**Limitation:** rotating the secret changes future results (documented).

## ADR-11: Escrow by existence, winner-picking by guarded update

**Decision.** A player-shop listing row *is* the escrow for stackable
quantities (created in the same transaction that decrements inventory);
instances flip to an `ESCROWED` status guarded by updateMany + a partial
unique index on active instance listings. Purchases pick exactly one winner
with `updateMany({status: ACTIVE → SOLD})`; proceeds claims use an equality
guard on the till amount. Wallet debits are guarded and CHECK-backed.
No serializable isolation needed — every invariant is a row-level guard.
**Alternative:** a separate escrow table (rejected: a second source of
truth to reconcile).

## ADR-12: Idempotency keys stored inside the mutation transaction

**Decision.** `IdempotencyKey` rows (unique per user+operation+key, with a
request fingerprint and stored result) are created inside the same
transaction as the mutation. Failures roll the key back (retry runs
fresh); successes replay their stored result; concurrent duplicates lose
the unique race and read the winner's result; fingerprint mismatches are
rejected. UI forms embed a server-generated key per render, so
double-submits replay instead of repeating.

## ADR-13: Database-backed rate limiting and audit trail

**Decision.** Fixed-window counters live in `RateLimitWindow` (upsert
increment, unique key+window) so limits hold across instances without new
infrastructure; `SecurityEvent` records violations, stale-stock attempts,
high-value purchases, cron auth failures, and admin actions, with an
`escalation-suggested` marker as the CAPTCHA/manual-review hook. Clients
only ever receive generic messages. **Alternative:** in-memory/Redis
limiter (rejected: new dependency; DB granularity is sufficient at this
scale — revisit under real load).

## ADR-14: One starter per account is a unique row, not a check

**Decision.** Adopting a starter creates a `StarterClaim` row (unique
`userId`, unique `petId`) *first* inside the adoption transaction; the pet
is created only after the claim insert succeeds. A concurrent duplicate
loses the unique race and maps to "already has a pet".

**Why.** The previous guard (count the user's pets, then insert) is a
read-then-write race: two concurrent requests both observe zero pets.
A constraint the database enforces cannot be raced. **Alternative:** a
partial unique index on `Pet(ownerId)` for starter pets (rejected: pets
are not unique per user forever; the claim models the actual invariant —
one *adoption event* per account). Proven by a 4-way concurrency test.

## ADR-15: One `OwnedAsset` boundary over hybrid ownership

**Decision.** Ownership stays hybrid (stackable quantities in
`InventoryEntry`, per-copy `ItemInstance` rows) but every consumer reads
it through `modules/items/ownership-view.ts`, which returns a single
`OwnedAsset` union (stack | instance) already filtered by lifecycle and
escrow, with policy helpers (`assetIsUsable`, `assetIsListable`,
`assetIsShowcaseable`, …). Showcases became instance-aware: stackable
definitions are showcased by item, instanced definitions by a specific
OWNED copy (`ShowcaseEntry.itemInstanceId`), ambiguous references are
rejected.

**Why.** Phase 2 left inventory pages, showcases, and listing forms each
re-deriving "what do I own and what may I do with it" — divergence was a
matter of time. One view module means new surfaces cannot invent their
own ownership rules. **Limitation:** the union type makes list rendering
slightly more verbose (two branches), accepted deliberately.

## ADR-16: Money is BIGINT end to end with one conversion boundary

**Decision.** Every money column is `BigInt`; every application value is
`bigint`; all conversion lives in `src/lib/money.ts` (bounded input
parsing, display formatting, decimal-string JSON serialization for
idempotency results and payloads). Player-facing bounds: inputs up to
1,000,000,000 coins; transaction totals up to 2,000,000,000.

**Why.** `Int` wallets overflow silently; `Number` corrupts above 2^53.
Converting at one boundary keeps `Number()` from reappearing ad hoc.
**Consequence:** stored idempotency results serialize coins as strings;
tests assert exactness past `Number.MAX_SAFE_INTEGER`.

## ADR-17: Provenance is an append-only relational table

**Decision.** `ItemProvenanceEvent` (event type, from/to users, source,
optional link to the causing ledger `Transaction`, timestamp) replaces
the Phase 2 JSON history array on `ItemInstance`. Rows are only ever
appended; the Phase 3 migration converted existing JSON arrays to rows.

**Why.** Mutable JSON history cannot be constrained, indexed, joined to
the ledger, or trusted after a bug. The economic ledger stays the
financial audit trail; provenance is the player-facing story linked to
it. **Alternative:** keep JSON with app-level discipline (rejected: the
class of bug this prevents is exactly "the app was wrong once").

## ADR-18: Item lifecycle is an enum, not deletion or boolean flags

**Decision.** `Item.lifecycle ∈ {DRAFT, ACTIVE, RETIRED, DISABLED}` with
policy helpers in `modules/items/lifecycle.ts`: DRAFT is invisible;
ACTIVE fully available; RETIRED stays owned/usable/tradeable but is never
distributed again; DISABLED is a kill switch that hides and inertly
preserves. Distribution paths (restock plans, grants) filter on
distributability; reads and purchases filter on visibility/usability.

**Why.** "Delete the item" destroys ownership records and history;
boolean pairs (`active`, `retired`) produce undefined combinations. The
enum states are exactly the operational situations operators face.

## ADR-19: Anchored per-shop restock schedules; the lazy path never blocks

**Decision.** Restock windows are per-shop `(intervalMinutes, anchorAt)`
arithmetic — window k covers `anchorAt + k·interval` — replacing global
UTC-hour alignment. Cron/admin restocks take the per-shop advisory lock
blocking; the request-path lazy fallback uses `pg_try_advisory_xact_lock`
and serves the prior valid inventory instead of queueing page loads
behind a lock. The reader is told nothing: a shelf a moment out of date is
not an error, and an explanation would be noise.
Failed restock executions persist a `FAILED` `ShopRestock` row (written
outside the rolled-back transaction) with an attempt counter; the unique
`(shopId, windowStart)` anchor still guarantees at most one COMPLETED
restock per window.

**Why.** Global alignment forced every shop to restock simultaneously
(load spike, same-moment world change); a blocking lazy path turns one
slow restock into a pile-up of stuck players; and a failure that leaves
no record is invisible to operators. **Limitation:** changing a shop's
anchor re-times future windows (documented operator action).

## ADR-20: Identity is `normalizedUsername`; closure is soft deactivation

**Decision.** `User.normalizedUsername` (NFKC → trim → lowercase,
unique) is the account identity for sign-in, profile lookup, and default
shop slugs; display casing is preserved separately. The migration
backfilled it with deterministic suffixing for collisions (audited via
`SecurityEvent`). Account closure is `deactivateAccount`: cancel
listings, return escrow, pay out the till, close the shop, revoke all
sessions, set `deactivatedAt` — never row deletion (Restrict FKs make
cascading over history impossible by construction). Slugs are stable
once public.

**Why.** Two users differing only by case are indistinguishable in URLs,
search, and support tickets; and deleting accounts would either destroy
the ledger or orphan it. **Consequence:** a legal-erasure workflow must
anonymize the retained row (future work, documented).

## ADR-21: Modules with command/query split; invariants that fail closed

**Decision.** Domain code moved to `src/server/modules/<capability>`
with commands (transaction-owning writes) separated from queries
(read-only, sharing the same eligibility predicates as writes via
`commerce/policies.ts`). Transaction ownership is type-enforced:
top-level commands take `DbClient`, helpers take `DbTx` and never begin
transactions. Production startup validates configuration and crashes on
dev fallbacks (`security/configuration.ts`); `x-forwarded-for` is only
trusted behind an explicit `TRUSTED_PROXY=true`. Economy consistency is
verifiable at rest: `scripts/reconcile.ts` re-derives wallet balances
from the ledger and checks the invariants listed in docs/operations.md, read-only — repairs happen
only through ledgered admin operations. Fault-injection tests
(`src/server/rollback.test.ts`) prove mid-transaction failures leave no
partial state.

**Why.** The Phase 2 `services/` tree mixed reads, writes, and policy;
the seams chosen here are the ones that carry the invariants. A wrong
`DbTx`/`DbClient` usage is now a compile error rather than a nested
transaction at runtime.

## ADR-22 (limitation removed by ADR-25): Three concrete daily activities, one narrow game-day service

> **Limitation removed.** The "Limitation" noted at the end of this entry —
> location pages mapping to activities via explicit slug constants — was
> removed by ADR-25. The slugs in `daily/locations.ts` are link targets
> and revalidation paths only; what renders at a location comes from its
> activity attachments through the typed registry, and `registry.test.ts`
> asserts the location route contains no slug comparison.

**Decision.** Phase 4 ships the daily word challenge, prize wheel, and
community meal as three self-contained modules under
`src/server/modules/daily/`, sharing only deliberately narrow
infrastructure: a pure game-day service (validated `YYYY-MM-DD` strings
derived from the UTC clock), a secure weighted-selection helper, shared
rate-limit rules, a read-only status summary, and a composed history
query. Each activity owns its tables, invariants (unique daily rows per
player), and submission logic. There is NO generic activity table, rule
interpreter, attempt engine, or reward-scripting system.

**Why.** Three real activities are the honest sample size for what daily
content needs; a speculative engine would encode guesses as schema. The
shared reward contract is a returned result *shape*, with all grants
flowing through the existing wallet/ownership/ledger services — so
reconciliation extends naturally (every daily reward must match its
ledger row).

**Randomness split.** Shared public content uses deterministic HMAC
selection (word answers keyed by `DAILY_SEED_SECRET` over
gameDate/difficulty/generationVersion — one stable global answer, frozen
at row creation, regenerable only for unplayed future dates). Private
per-player outcomes (wheel prizes, meal picks) use CSPRNG
(`crypto.randomInt`) — never date-derived determinism a player could
precompute. Wheel prize weights are basis points summing to 10 000;
recorded spins reference their configuration version forever, so weight
changes are new versions, never edits.

**Concurrency.** Daily uniqueness is enforced by database constraints
(`(userId, puzzleId)`, `(userId, wheelId, gameDate)`,
`(userId, gameDate)`), claimed *before* any grant inside the idempotent
transaction; word attempts advance through an equality-guarded update.
Losers of a daily race receive the recorded outcome, not an error and
never a second reward. **Limitation:** the three location pages map to
their activities via explicit slug constants — a fourth activity means
code, which is the point.

## ADR-23: Pre-alpha disposability, content-as-TypeScript, ordered word rotation

**Decision.** Three linked pre-alpha decisions (supersedes the
word-selection paragraph of ADR-22):

1. **Pre-alpha disposability.** The schema and all development data are
   disposable until external tester data must survive (policy in
   CLAUDE.md). The five phase migrations were squashed to one `0_init`
   baseline carrying every hand-written CHECK constraint and partial
   index; obsolete infrastructure is deleted outright rather than
   soft-deprecated.
2. **Content as organized TypeScript.** All game content lives in
   `prisma/content/` as plain data files by domain, Zod-validated
   OFFLINE (`npm run content:validate` — duplicates, broken references,
   ranges, eligibility, weight sums), synchronized by `prisma/seed/`
   modules with an explicit policy per domain (UPSERT_ONLY for released
   items; SYNC_AND_DEACTIVATE_MISSING for shop/wheel/meal pools;
   IMMUTABLE_VERSIONED for played wheel configurations; ordered
   source-of-truth for word rotations; history is never touched) and a
   per-domain change report. Guarded `db:reset`/`db:fresh` commands
   refuse production and non-disposable targets. **Rejected:** YAML/JSON
   files, a CMS, database-only authoring.
3. **Ordered word rotation, no dictionary.** The accepted-guess
   dictionary, HMAC answer selection, recent-answer exclusion, and
   `DAILY_SEED_SECRET` are removed. `DailyWordAnswer` rows (unique
   difficulty+position, difficulty+word) mirror the authored arrays in
   `prisma/content/daily/word-answers.ts` (index = position, append-only,
   100 per difficulty); each difficulty advances one answer per UTC game
   day from a documented epoch and wraps after the last ACTIVE answer.
   Puzzles freeze their answer reference at creation. Guesses are
   validated by shape only: any exact-length A–Z sequence consumes an
   attempt. **Why:** authored order beats opaque determinism for a curated
   daily; a dictionary that rejects honest guesses punishes players for
   the word list's gaps.
   **Amended by ADR-44:** the selection is HMAC-keyed again and runs per
   band rather than globally, so the epoch and its day-counting helper are
   gone. Everything else here stands — the lists are still authored,
   ordered, append-only, and there is still no dictionary. What ADR-23
   argued for was curatorial control over *which* words appear; ADR-44
   changes only *who* sees which of them on a given day.

## ADR-24: Player UI design contract (Phase 6)

**Decision.** The player interface is built from a documented set of
layout primitives rather than route-local markup: tokens in
`globals.css` `@theme` (including motion durations, elevation levels,
rarity and word-tile state colors, and a derived bottom-navigation
clearance that includes the safe-area inset), and shared primitives in
`src/components/ui` (`PageHeader` with quiet back navigation,
`SectionHeading`, `StatusBadge` with a fixed player-status vocabulary,
`InlineNotice`, `ItemIdentity` as the single item presentation block,
`CurrencyAmount` as the single bigint-coin renderer, `TextLink`,
`IconButton`, `FilterBar`, `EmptyState`, `ArtworkFrame` with focal-point
and placeholder support). Page types (dashboard, world/region/location,
catalog, detail, profile, form) are composition conventions documented
in docs/conventions.md — deliberately NOT a generic page-builder or
screen engine.

**Why.** Before this pass, seven surfaces rendered an item in six
different markups, section headings were hand-typed 21 times, and empty
states existed in three visual languages. Content production (many more
locations, items, shops) multiplies every inconsistency; new screens now
inherit sound patterns by default.

**Also decided.**
1. ADR-8 stands: still no route-group `loading.tsx` (the Next.js
   router-wedge bug it documents). `Skeleton` remains for targeted use.
2. The wallet is shell-level UI (sidebar block + mobile utility bar), so
   purchase decisions never happen blind.
3. Daily activities expose one status vocabulary on the dashboard panel,
   the location pages, and the result panels; recorded results stay
   visible for the rest of the game day.
4. Component contracts are tested with `react-dom/server` static
   rendering (no new dependencies); browser behavior (keyboard-only
   flows, reduced motion, viewport fit at 320-1280px, conflict
   feedback) is covered in Playwright, plus a screenshot-capture spec
   at four review widths.

## ADR-25: Location activities as typed attachments (Phase 7)

**Decision.** A location declares zero or more ordered *activity
attachments* (`LocationActivity`: `type` from a finite enum, a stable
`activityKey`, `displayOrder`, `active`). The world domain owns locations
and attachments and imports no activity domain. Each activity keeps its
rules, commands, queries, and view models in its own module. A UI
composition layer (`src/components/location-activities/`) holds a
registry — `satisfies Record<LocationActivityType, LocationActivityRenderer>`
— mapping each type to one narrow server component; it may import both
sides. The location route loads the location plus its active attachments
and delegates each to the registry.

**Why.** Before this, the location page decided what to render by
comparing `location.slug` to constants (`WORD_LOCATION_SLUG`, …). Every
new activity meant editing that switch, and a location could host exactly
one feature. The attachment model makes "what can I do here" content,
adds multi-activity locations for free, and makes adding an activity type
a compile-time-checked local change rather than a central edit.

**Deliberately not built.** No generic activity engine: no JSON config on
the attachment, no polymorphic foreign keys, no dynamic imports from
database strings, no scripting. `activityKey` is resolved by the owning
domain and validated offline. Adding fishing means adding an enum value,
a module, a renderer, and a validation rule — four explicit edits, none
of them a switch statement over slugs.

**Failure isolation.** `renderLocationActivity` catches per attachment,
logs `{type, key, location, code}`, and substitutes an "unavailable"
panel. One misconfigured activity cannot blank a location page, and the
player never sees the reason.

**Request boards** are the first activity built on this boundary. Design
choices worth recording:
1. **Ordered authored list, per-player progress.** `sequencePosition` is
   contiguous from 0; each player has one `PlayerRequestBoardProgress`
   row and advances independently, wrapping after the last ACTIVE entry.
   Inactive entries are skipped when assigning, but an already-assigned
   request stays frozen — completion is refused explicitly rather than
   silently swapped.
2. **Optimistic concurrency, not locking.** The client submits the
   `stateVersion` its view was built from; the advance is a guarded
   `updateMany` on that version. A stale token refuses the whole
   transaction, so nothing is consumed. Combined with the idempotency
   key, a double-submit replays and a genuine race produces exactly one
   completion.
3. **Snapshotted history.** `RequestCompletion` stores the reward granted
   and the requirements consumed, linked to its ledger row. Old
   completions are never recomputed from current content.
4. **A cap that defers, never punishes.** `dailyCompletionLimit` bounds
   completions per UTC game day. Reaching it leaves the assignment in
   place and says so — consistent with the no-FOMO rule in
   docs/design-philosophy.md.
5. **Arbitrage is a content error.** Validation fails a reward that
   exceeds the NPC purchase cost of its requirements, and
   `content:validate` prints a margin report. The shipped board requires
   daily-meal foods, which no shop sells.

## ADR-26: Scoped rate limiting, intent-declaring grants, revalidation inside the transaction

Three rules came out of the security review pass, each of which had been
violated somewhere and each of which is now enforced structurally.

**1. A rate limit must be scoped to something the abuser cannot share
with everyone else.** The auth limiters keyed on a hashed client origin
that, without `TRUSTED_PROXY=true`, was the constant `"unknown"` — so
every anonymous request on earth landed in one bucket. Sign-up had *only*
that bucket, at five per five minutes: any one caller could stop the
whole game from registering accounts, which is precisely the outcome the
limit exists to prevent. `resolveClientOrigin()` now returns `null`
rather than a placeholder, and callers skip origin-scoped limits when
there is no origin instead of aiming them at everybody. Identity-scoped
limits (the account signing in, the name being claimed) always apply,
because they cost an attacker exactly the surface they are attacking.
Account creation keeps one deliberately shared ceiling
(`SIGNUP_BURST_LIMIT`, default 60 per five minutes) because there is no
per-player dimension before the player exists; it is set high enough that
tripping it means something, and is documented as an operator signal
rather than a routine condition.

Related: when a forwarding header *is* trusted, the trustworthy value is
the hop the proxy added, not the first entry. An appending proxy
(`$proxy_add_x_forwarded_for`, which the bundled nginx config used)
leaves the client's own claimed address first in the list, so trusting
`x-forwarded-for[0]` handed the attacker their choice of bucket. The app
now prefers `x-real-ip` and otherwise reads the last hop, and the nginx
config overwrites both headers.

**2. A grant must declare why it is happening.** `grantItem` took an
`Item` the caller had loaded at some earlier point and wrote it to
inventory unconditionally. Daily rewards draw a prize from a pool
snapshot read before the transaction opens, so "earlier" could be
arbitrarily stale — the item lifecycle kill switch was only as good as
the last check some caller happened to make. `grantItem` now requires
`reason: "distribution" | "restoration"` and re-reads the lifecycle
inside the granting transaction for distributions. The parameter is
required, not defaulted, because the two cases have opposite answers for
a disabled item and the compiler should make every call site say which
one it is: pulling an item out of circulation must never confiscate the
copies players already own, so escrow returns and operator adjustments
stay allowed.

**3. A read that feeds a write belongs inside the writing
transaction.** Feeding a pet read its stats, consumed the food, then
wrote the stats back from the pre-consumption snapshot: four concurrent
feedings reliably consumed four items and applied two. Daily rewards
selected an outcome from a configuration read before the transaction and
never rechecked it. Showcase commands read the whole ordered list and
rewrote it, so two concurrent edits silently discarded one. Each is now
fixed in the same shape — read inside the transaction and guard the write
on the snapshot (`Pet.statsUpdatedAt`), re-check the configuration inside
the transaction (wheel, meal), or serialize on a per-user advisory lock
where there is no single row to guard (showcase). `@@unique([userId,
position])` on `ShowcaseEntry` backs the last one so any future partial
update fails loudly.


## ADR-27: Pet condition is described, not measured; a full pet refuses food

**Stats stay numeric on the server and become words at the edge.** Pets
are still stored and reasoned about as 0–100 integers with
timestamp-based decay — nothing about the simulation changed.
`src/lib/pet-condition.ts` maps those integers onto five named states per
stat ("Starving" … "Stuffed") and is the single place that mapping
exists.

Why the change: a displayed number invites the player to optimise it.
"Hunger 78/100" reads as a gauge to top up, and it implies a precision
the value never had — it drifts continuously with elapsed time, so any
figure on screen is stale the moment it renders. "Well fed" says the only
thing a keeper actually needs to know. It also fits the no-punishment
rule: a player returning after a week sees "Hungry", not a number that
looks like a score they let slip.

Consequences worth recording:
1. **One shared band scale** (0/15/35/60/85) across every stat, so a
   player learns the scale once and the meters stay comparable.
2. **Five segments, not a bar.** A bar filled to an exact fraction is a
   number by another name. Five segments say exactly what the five words
   say and nothing more. The state name always accompanies the meter, so
   meaning never rests on colour, and `aria-valuetext` makes assistive
   technology announce the state rather than a band index.
3. **The vocabulary lives in `src/lib`**, not a domain module: it is pure
   presentation with no rules attached, and client components must be able
   to import it.
4. **Derived numbers go too.** Food is described by how filling it is.
   Leaving "restores 30 hunger" on an inventory row would have handed the
   player one half of an arithmetic problem whose other half we removed.
5. **`FeedPetResult` stays numeric.** It is a domain result and the stored
   idempotency replay payload; the server action converts it to words
   before anything reaches the player.
6. **Pets have no level.** It was the last number on the pet card and it
   measured nothing: it was set to 1 at adoption and never changed, so it
   read as a progress bar the game had no intention of filling. Removed
   from the schema, the public profile projection, and both pages rather
   than left as decoration or as a promise of a system that does not
   exist. Care is the loop; a rank on top of it would only reintroduce
   the score the named states were meant to retire.

**Feeding past full is refused, not clamped.** `feedPet` now raises
`PET_FULL` when the meal would take hunger over the maximum, and the
transaction rolls back so nothing is consumed. Clamping quietly destroyed
the surplus: feeding a nearly full companion a large meal spent the whole
item for a few points, and the player had no way to see it happen — the
kind of loss you only discover by noticing something missing. Refusing
costs the player nothing and explains itself. The refusal is about right
now, not forever: hunger decays, and the same food works later.


## ADR-28: Page-view random events

Classic page-based random rolls: visiting a game page can, occasionally,
make something happen. Three decisions carry the design.

**1. One guarded write is the whole concurrency story.** Claiming
`RandomEventState.lastRollAt` with a guarded `updateMany` is
*simultaneously* the anti-duplicate check and the row lock the rest of the
transaction rides on. A second concurrent request blocks on that row,
re-evaluates the guard after the first commits, sees the claim, and stops.
Cooldown check, probability roll, selection, effects, occurrence, and
cooldown update all happen inside that same transaction, so there is no
window in which two requests can both proceed from one eligible moment and
no partial state if any effect fails. An idempotency key on top means a
retry after a lost response replays the recorded outcome rather than
rolling again — which matters here more than usual, because the roll
commits before the player's browser learns anything.

**2. "Does anything happen" is separate from "what happens".** A single
probability in config answers the first; catalog weights answer the
second. Conflating them would mean retuning event frequency every time an
event is added, and adding twenty flavour events would quietly make events
more common. They are also gated differently: the cooldown short-circuits
before any dice are rolled at all.

**3. Routes are an allow-list, not a deny-list.** A deny-list opts every
future route in by default, which is the wrong default for something that
grants coins — a new admin screen or checkout flow should not become an
event surface because nobody remembered to exclude it. The client reports
which route it is on and the client can lie; that costs nothing, because
claiming an eligible path only buys a roll the player could have had by
visiting an eligible page, and every bound that actually limits rewards
(anti-duplicate window, cooldown, probability, rate limit) is server-side.

Supporting choices:

- **The catalog is code, not seeded rows.** Unlike wheel prizes, event
  definitions are never written to the database. Occurrences instead
  freeze their resolved title, message, and effects, so retuning a weight
  or rewriting copy never edits history. Offline validation still covers
  the catalog (`prisma/seed/validation.ts`) exactly as it covers the
  starter pack — item slugs, route rules, and the no-harm bounds.
- **Effects are a registry, exhaustive at compile time.** Adding a
  consequence is an entry in `effects.ts`; adding an event is an entry in
  the catalog. Neither touches the roll, which never learns any event's
  name. Every effect routes through the existing economy boundaries —
  `creditCoins`, `recordLedger`, `grantItem`, the pet stat guard — so an
  event is one more caller of the same economy, bound by the same item
  lifecycle rules and ledger requirements as a shop purchase.
- **The no-harm bounds are enforced by the validator, not by discipline.**
  Health can never be reduced (pets cannot die), stat deltas are capped in
  a mild range, coin rewards have a ceiling, and instanced
  provenance-bearing items cannot be granted at all — a one-of-a-kind
  object deserves a story about where it came from, and "you loaded a
  page" is not one.
- **A failed event is a non-event.** Any effect failure rolls back the
  claim, the cooldown, the occurrence, and every reward together, and the
  player is told nothing happened — which, thanks to the rollback, is
  true. A random event is a garnish on a page the player already has; it
  must never be why a page view looks broken.
- **The occurrence log is not decoration.** The roll commits server-side
  before the response reaches the browser, so a connection dropped at the
  wrong moment can leave a player rewarded and never told. `/history/events`
  is where they check.

## ADR-29: Play is the happiness verb; energy recovers by resting

**Status:** accepted

**Context.** Four pet meters were rendered on the home page and only one of
them — hunger — could be moved by a player. Happiness decayed 3/hr and
energy 2/hr with no recovery path of any kind, so after about a day and a
half the home screen said *"Downcast — Out of sorts and in need of
company"* and offered nothing to do about it. Meanwhile TOY items carried
a seeded `happinessBoost` no code read, were sold in NPC shops for up to
260 coins, and one was granted to every new player in the starter pack. A
player could buy a kite and receive an inventory row with no affordance.

**Decision.**

**1. Playing raises happiness, and a toy is not consumed by it.** Feeding
eats the food; playing does not eat the toy. A toy is a possession — you
buy the kite once and it stays yours. Consuming it would make TOY items a
second, worse food, and would make the 260-coin kite a single-use
purchase, which is the shape of a mechanic players resent.

**2. The limiter is variety, not spending.** Each (pet, toy) pair has its
own 90-minute cooldown, claimed with a guarded `updateMany` on
`PetToyUse.lastUsedAt` — the same one-guarded-write pattern the random-event
roll uses, so the claim is simultaneously the anti-duplicate check and the
row lock. Owning a second toy means playing again straight away. This
rewards having a varied toy box rather than a large one, and it means the
answer to "my companion is sad" is always available to a player who has
been buying toys at all.

**3. Energy regenerates instead of decaying.** Energy was decaying with no
recovery, and CLAUDE.md forbids gating play on energy — so a decaying
energy meter could only ever be a number that goes down and means nothing.
Inverting it gives it a job: playing spends 4 energy, and a fed companion
recovers 5/hr while you are away. Rest is what happens between visits.
Play is never *blocked* by low energy; an exhausted companion still plays
and still gains the full happiness, it simply has less energy afterwards.
Energy regeneration stops when hunger reaches zero, so the one stat that
needs the player is still the one that gates the others.

**4. A delighted companion refuses, spending nothing.** At 100 happiness
`PET_DELIGHTED` is returned before the cooldown is claimed, so the refusal
does not burn the toy's novelty — the same shape as ADR-27's full pet
refusing food.

**Consequences.** `Pet.energy` now means "rested", not "worn out", and
`docs`/copy describing it as decaying are wrong. `PetToyUse` is a new
per-(pet, item) row rather than a column on either side, because the
cooldown belongs to the pairing. Adding a toy is still content-only: give
the item `type: "TOY"` and a `happinessBoost`.

## ADR-30: A request can be set aside, free and unlimited

**Status:** accepted

**Context.** A request board assigns one request at a time from a fixed
sequence and does not advance until that request is completed. The
requirements are foods that no shop sells (deliberately — ADR-25 keeps
them un-buyable so the board cannot be arbitraged against a shop), which
means the daily community meal is the only source. The meal hands out a
random item from a pool of ten. A player whose current request needs three
roasted mooncarrots and whose pantry holds biscuits has exactly one
available move: wait, and keep waiting, until the pool happens to deal
them carrots. That is a wall, not a difficulty curve, and
`docs/design-philosophy.md` does not permit it.

**Decision.** Add `skipCurrentRequest`: the player asks the board for a
different request, and the next active one in the rotation is posted
instead.

**1. Free, and not rationed.** No coin cost, no item cost, no daily
allowance, no cooldown beyond the abuse rate limiter. A player who skips
every posting on the board arrives back where they started having gained
nothing, so there is nothing to farm. Charging for it would convert "I
can't do this one yet" into a penalty, which is precisely the mechanic the
design rules exclude.

**2. A bounded skip is choice, so call it choice.** Skipping one position
at a time, unlimited, is the same thing as picking any request on the
board — a player who wants the fifth one clicks four times. Pretending
otherwise by rationing skips would only add friction to a decision the
player is going to make anyway. The daily completion cap, not the
rotation, is what bounds a board's payout; and rewards scale with what a
request asks for, so choosing freely moves the ceiling by about a tenth,
not by an order of magnitude.

**3. Nothing is recorded.** No history row, no ledger entry, no
completion ordinal, no change to `totalCompleted`. Nothing happened:
history is for things that did.

**4. It shares the completion command's conflict token.** Skipping
increments `stateVersion` under the same guarded `updateMany`, so a
completion submitted from a tab that still believes in the old assignment
is refused with `STALE_STATE` and consumes nothing. Both intents therefore
route through one server action, which returns the whole re-read board —
the board renders on a location page that `revalidatePath` cannot name
from an action, and both intents change which request is posted, so the
response has to carry the new one or the player is left reading a
shopping list for a request they no longer have.

**Consequences.** `RequestBoardView` gains `hasOtherRequests`, and a board
with a single active posting refuses the skip with `NO_OTHER_REQUEST`
rather than burning a state version to hand back the same request. Boards
no longer need their sequence tuned so that early requests are reachable
from a beginner's pantry, because an unreachable one is now a click to
move past.

## ADR-31: A rejected request must not cost more than an accepted one

**Status:** accepted

**Context.** `enforceRateLimit` counted the attempt, and then, on every
attempt past the limit, wrote a permanent `SecurityEvent` row. Retention
swept `info` only, so `warning` accumulated forever. A rejected request
therefore cost two writes where an accepted one cost one, and the extra
write was the permanent kind — on `signIn`, which is reachable
unauthenticated. Hammering it grew a table without bound. The limiter was
the amplifier.

**Decision.**

**1. The violation event is deduplicated per rule, not recorded per
rejection.** `recordSecurityEventDeduplicated` claims an in-process window
before awaiting, so repeat rejections cost a map lookup. The event answers
"is this rule being hit"; the count lives in the `RateLimitWindow` row,
which is swept at 24 hours.

**2. Dedup is keyed by rule, not by subject.** The subject is what an
attacker varies — a wordlist changes the username every request — so a
per-subject key would restore exactly the unbounded growth this removes.

**3. `warning` is swept too, on a longer horizon than `info`.**
`critical` is still never swept: those are the rows an operator goes
looking for months later.

**Consequence.** Whether a given rejection reaches the database depends on
what the process did earlier, so `resetDeduplicationWindows()` is a real
test seam rather than a leftover: a test asserting an event was stored has
to start from a known window or it passes and fails by suite order.

## ADR-32: Failure costs the same whether or not the account exists

**Status:** accepted

**Context.** Sign-in read the user, then short-circuited:

```ts
if (!user || user.deactivatedAt !== null ||
    !(await verifyPassword(password, user.passwordHash))) { … }
```

One message for every failure — but not one *cost*. A nonexistent username
answered after a single indexed lookup; a real one additionally paid a full
scrypt derivation. That difference is large, stable, and trivially timed.
The per-username rate limit does not bound it, because enumerating a
wordlist uses each username once, and the per-origin rule is skipped
entirely when `TRUSTED_PROXY` is not set — the documented default.

**Decision.** When there is no account to verify against, verify against a
decoy hash derived at startup from random bytes. Both paths do the same
work and fail the same way. The decoy is derived once, not per request, so
the mitigation costs one derivation per process.

**Also decided here:** scrypt parameters are stored in the hash
(`scrypt$N$r$p$salt$hash`) rather than implied by a constant, and N is
raised to 2^17 (OWASP interactive). Verification reads the parameters from
the row, so the cost can be raised again later without invalidating every
existing password — which the old parameterless `salt:hash` format made
impossible. The old format is deliberately not supported: pre-alpha
development accounts are disposable (CLAUDE.md), and a compatibility branch
would outlive the passwords it served.

## ADR-33: The word puzzle is a pleasant minute, not the economy

**Status:** accepted

**Context.** The three daily word puzzles paid 100, 250, and 500 coins —
850 a day, every day, from the first login. Measured against everything
else in the shipped game:

| Faucet | Coins/day |
|---|---|
| Daily word × 3 | **850** |
| Prize wheel (expected value) | 47.5 |
| Random events | ~8 |
| Request board | ~11 (and 0 in week one) |

Feeding a companion costs about 61 coins a day. So the word game paid
roughly fourteen times the entire recurring cost of playing, and about
ninety-three percent of every coin entering the world, before the player
had learned anything about it.

Three consequences, all of them things a player can feel:

- **Prices stop meaning anything.** Shop prices, market listings, and the
  estimated value printed beside every item in the satchel describe a
  scarcity that does not exist. Every sink in the game — all four shop
  capacity tiers plus one of every purchasable item — is about
  forty-eight days of net income away, after which coins do nothing.
- **The effort gradient runs backwards.** The request board asks a player
  to gather specific ingredients over days; the word game asks for one
  minute; the word game paid eighty times more.
- **The exploit is worth eighty times more than it should be.** One
  global puzzle per day means one player can post the answer and everyone
  else collects. That is a separate problem (see below), but the size of
  the prize is what makes it worth doing.

**Decision.** 30 / 60 / 120 — 210 a day for all three. The word game
stays worth doing daily and stays the reliable floor for a player with
five minutes, but the request board becomes the largest earner for a
player who works for it, which is the shape the effort deserves.

Rewards remain data-configurable per puzzle row; this changes the default
snapshotted onto new puzzles and never rewrites a puzzle already played.

**Left open here, decided in ADR-44: the shared answer.** One puzzle per
(gameDate, difficulty) was global, the answer is returned to the client on
failure as well as success, and the rotation was pure date arithmetic over
a fixed list — so today's word could be posted, and after one full
rotation the whole future schedule was public. Lowering the reward reduced
what that was worth by three quarters; ADR-44 removed it at the root.

Note that the secret-free variant floated here — an index derived from the
game date and the player id, no HMAC, no stored secret — is the one ADR-44
rejected, and for a reason this paragraph missed: an attacker maps the
bands once and then computes the whole future schedule for free, which is
the same failure as the global rotation with a one-off entry fee bolted
on. The operator-tooling cost anticipated here was real and was paid:
`puzzle:preview` and `puzzle:regenerate` are band-scoped now, and
`puzzle:set-reward` deliberately stayed whole-date because pay must not
vary by band.

## ADR-34: Foraging — the verb the player initiates

**Status:** accepted

**Context.** Every way to get an item was something done *to* the player.
The daily meal deals you one item from a pool. The wheel deals you a
prize. The shop sells you whatever it restocked. The request board pays in
coins. A player who wanted a particular thing had exactly one move
available — wait, and hope — and the world reflected that: `Explore` is
the second item in the navigation and it led to reading. Two of
Dapplewood's eight locations hosted nothing at all.

The architecture had been built for this and never asked to hold it. The
activity model (World Map → Region → Location → ordered attachments) and
the compile-time-exhaustive renderer registry exist precisely so a new
kind of thing-to-do is four explicit edits and no central switch.

**Decision.** A foraging spot is a weighted pool of items attached to a
location, with a per-player daily cap. One button: *Have a look around*.

**1. Spots pay in items and never in coins.** A spot cannot become a coin
faucet by accident or by a later content edit — the ledger row it writes
carries `coinsDelta: 0`, and a test asserts the player's balance is
unchanged. Value reaches a wallet only by passing through the market,
which moves coins between players rather than minting them.

**2. The pool is content, and it is not published.** What a place yields
is authored, not computed — and the view model deliberately omits it.
A player learns a spot by searching it; printing the loot table replaces
that with reading a table. There is also no count of what a spot contains
or how much of it you have seen, because that is a developer-defined
collection checklist with a hat on, which CLAUDE.md rules out three ways.

**3. Sometimes you find nothing, and it says something.** "Nothing"
competes in the same weighted draw as the items rather than being a coin
flip layered over one, at roughly one search in seven. Some searches
finding nothing is what stops a spot being a dispenser. The empty-handed
search is still recorded and still spends one of the day's looks — so it
can never be silently retried — but it is not shown back in the day's
finds strip, because a row of blanks reads as a scoreboard of failure.

**4. The cap is a count AND a constraint.** `ForageFind` is unique on
`(userId, spotId, gameDate, searchOrdinal)`. The count that precedes the
insert is the friendly check; the unique row is what actually bounds the
day, so two searches racing for the last slot collide and exactly one
commits. Reaching the cap defers work to tomorrow and takes nothing away.

**5. A spot may grant an instanced, provenance-bearing item — where a
page-view event may not.** ADR-28 forbids that for random events on the
grounds that "a one-of-a-kind object deserves a story about where it came
from, and 'you loaded a page' is not one." *Found in the shallows under
the old footbridge* is a story. That is the whole distinction, and it is
why the rule is stated per-activity rather than globally.

**6. Foraging is deliberately absent from the activity directory.** The
`/activities` tab lists what there is to do today; the moment
they list every spot with a "2 left today" chip, wandering becomes a
chore route and the map becomes a checklist. The region map badges which
locations carry a spot, and that is the entire discovery surface — finding
out that the footbridge has shallows worth looking at should itself be a
small discovery.

**7. Content validation enforces the request board's supply invariant.**
ADR-25 keeps request-board ingredients un-buyable so a request can never
be arbitraged against a shop, and ADR-30's difficulty assumes the daily
meal is their only tap. A forage spot quietly yielding one would re-price
the board without anybody deciding to — so `prisma/seed/validation.ts`
now rejects any forage entry whose item appears in a request requirement
or in the meal pool. The invariant is checked, not remembered.

**Consequences.** Two locations that hosted nothing now host something,
without either of them needing a shop. Adding a spot is a content file
plus one attachment. The market gains a supply of ordinary goods that did
not come off a shelf, which is what player shops need in order to be
interesting. And `Explore` is a verb.

## ADR-35: Decay is sized against the player who visits once a day

**Status:** accepted (revises ADR-29)

**Context.** ADR-29 set hunger decay at 4/hour and happiness at 3/hour,
reasoning about them qualitatively. Measured against a ceiling of 100 and
a twenty-four hour day, those numbers say something the ADR did not
intend:

| stat | decay/day | ceiling | slack |
|---|---|---|---|
| hunger | 96 | 100 | **4** |

Someone logging in every twenty-four hours — the cadence this whole game
is built around — arrived to a companion at hunger 4. The condition bands
put that in the bottom one: **"Starving", every single day, with no play
pattern that could avoid it**, and health beginning to decay an hour
later. The most prominent thing on the home screen told an attentive
player they were failing, permanently, and there was nothing they could
have done differently.

Happiness at 3/hour was 72 a day, against a toy box whose five toys sum
to 93 — but only if you own all five, including the 260-coin kite, which
is 62% of the total cost. Breaking even required the expensive toy. That
is the opposite of ADR-29's stated intent, which was that a *varied* box
beats a large one.

And energy, at 5/hour of regeneration against a maximum possible spend of
20 a day, could not move at all. It was a constant drawn as a meter.

**Decision.** Hunger 3/hour, happiness 2/hour, energy regeneration
3/hour, play cost 10.

- **Hunger 72/day.** A daily visitor arrives at 28 — "Hungry", which is a
  companion pleased to see you rather than an accusation. The zero-hunger
  cliff moves from 25 hours to 33, so a late login is late rather than
  punished. This is what "missing a day must not permanently
  disadvantage" has to mean arithmetically.
- **Happiness 48/day.** Three toys (97 coins) break even; four have
  margin. The varied box is the answer, as intended, and the expensive
  toy is a nice thing to own rather than a tax.
- **Energy moves.** Playing through a whole toy box in a session visibly
  tires a companion and a night's rest visibly restores it. It still
  never blocks anything — an exhausted companion plays and gains the full
  happiness, the cost floors at zero (CLAUDE.md forbids energy gates).

**The general rule this encodes:** a decay rate is a statement about a
visit cadence, and it must be checked against one. A rate that leaves no
slack at the intended cadence turns the game's own status display into a
standing reproach. There is now a test that asserts twenty-four hours of
decay leaves real room above zero, so this cannot drift back silently.

**Also decided here: composed requests must beat their parts.** The two
multi-ingredient requests paid 58 and 95 coins for ingredient sets worth
59.2 and 95.8 in their own single-ingredient requests — so the board's
only two interesting cards were strictly dominated, and an optimiser
skipped them forever. They now pay 72 and 118. Assembling several
different things is more work and should pay more; that it did not was an
arithmetic accident nobody had checked.

## ADR-36: A faucet needs a ceiling on outcomes, not just on attempts

**Status:** accepted (extends ADR-28)

**Context.** Random events are bounded by an anti-duplicate window (3
seconds between attempts), a post-event cooldown (15–45 minutes), and a
rate limit (60 rolls a minute). Every one of those bounds the gap between
*attempts*. Nothing bounded how many attempts a day could contain — and
the trigger is a page view, which a twenty-line script can produce all
night. Measured against the shipped configuration, that is about 47
events a day against a person's 2: a 24× advantage on a faucet that pays
both coins and items.

ADR-28 reasoned that a client lying about its route "only buys a roll the
player could have had by visiting an eligible page." That is true per
roll, and it skips the rate. The bound was on the wrong quantity.

**Decision.** Six events per player per UTC game day, checked before any
dice are rolled. `RandomEventOccurrence` now carries a `gameDate` like
every other daily record, so the ceiling counts on the same clock the
roll uses rather than on a database default.

Six is far above what the cooldown yields a person in a normal day, so it
never binds on anybody playing the game. It simply removes the reason to
leave a script running.

**The general rule:** when a reward is triggered by something a client can
produce at will, pacing the trigger is not a bound. Cap the outcome.

## ADR-37: The Sorting Bench — a score the server derives, not receives

**Status:** accepted

**Context.** The game had one minigame, and it was a once-daily puzzle. It
had nothing you could sit with; nothing where the second attempt was
better than the first because *you* were better. That is the "one more
try" beat the genre runs on, and it is the beat that survives a player
having already seen everything else.

The obvious way to build one is also the wrong way: let the client run the
game and post a score. Every bound after that is a guess about how large a
lie is plausible.

**Decision.** The board is never stored. A run is a **seed** and an
**append-only list of shelf indices**, and the score is derived by
replaying them on every submission.

**1. The client has nothing worth lying about.** It submits shelf
numbers. It never sends a board, a score, or an outcome, because it has no
field for one. This is the same property the word puzzle has — the answer
never reaches a playable board — expressed for a game with state.

**2. The client is told seven finds and no more.** The find in hand, the
four it may still place this batch, and two to look ahead at. The seed is
never serialized into a response, a log line, or an idempotency payload; a
test asserts it does not appear in a run view.

**3. The window is CLAIMED before anything is adjudicated.** The real
attack on a batched game is the fork: submit five moves, dislike the
result, submit five different ones for the same finds. The guarded
`drawIndex` advance happens first, so the second attempt carries an index
the row no longer holds and fails.

**4. An illegal move VOIDS the run and COMMITS.** This is the subtle one.
Throwing would roll the claim back — handing the caller exactly the fork
the claim exists to prevent. So an impossible submission ends the run,
writes a security event, and commits. An honest client cannot produce one:
it runs the same rules the server adjudicates with.

**5. The rules are one implementation, in `src/lib`.** The browser imports
`applyPlacement` to move the board under the player's thumb; the server
imports the same function to decide what happened. Two implementations
would drift, and the one that drifts is always the one nobody is checking.
The shuffle stays server-only.

**6. The deck is fixed and finite, and the shuffle is pinned.** Twelve of
each of five kinds. (This paragraph originally claimed that counting what
is left "is the difference between this and a slot machine". It was not
true as shipped, and it is only partly true now — see ADR-41.) The
shuffle uses an explicit
SHA-256 stream with rejection sampling rather than anything from the
platform, because the guarantee it needs is "the same seed yields the same
deck in five years", not speed. A run in progress must never change under
its player.

**7. Repetition pays nothing; improvement pays once.** Unlimited runs,
with a best-of-day tier ladder — capped at 75 coins as shipped, raised to
150 by ADR-41. Playing for two hours
because you enjoy it earns exactly what one good run earns, so the game
can be unlimited without being a grind, and there is no reason to leave a
script running: a bot that plays perfectly earns what a good human earns.
There is deliberately **no leaderboard** — the design philosophy asks for
admiration without unhealthy competition, and a leaderboard is the thing
that would make the solver worth writing.

The ceiling sits under the word puzzle's 210 (ADR-33), so adding a second
real activity does not disturb the ordering of the economy. (Still true at
150; see ADR-41 for why 75 was too low.)

**Consequences.** `SortingRun` stores a seed, a move string, and a derived
score — replaying ~60 placements per submission is free, and there is
nothing to desynchronise because there is no stored board to desynchronise
from. A partial unique index enforces one live run per player, which is
what stops someone holding several boards and submitting whichever turned
out well. A closed tab loses nothing: the run is resumed from its seed.

## ADR-38: "While you were away" reports arrivals, never absences

**Status.** Accepted.

**Context.** The player's shop already sells things while they are logged
out, and the till already fills up. Until now the only way to find out was
to navigate to `/shop` and notice a bigger number. Something genuinely
happened in the player's favour and nothing told them — the missing last
step of a feature that was otherwise finished.

The obvious shape for this is a "what's new" panel, and the obvious shape
for that is a badge with a count, an empty state on quiet days, and — one
small step later — a line about how long it has been since the last visit.
That last step is the trap. Every one of those is the same mechanic
wearing a friendlier face: a number that is zero unless you come back.

**Decision.** A returning player is shown what happened *for* them, and
nothing else.

**1. It only ever reports things that happened in the player's favour.**
Sales, and later anything else that arrives on its own. It never
enumerates what was missed: no "you skipped 2 wheel spins", no "3 days
since your last visit", no streak. CLAUDE.md forbids punitive inactivity,
and an absence counter is punitive inactivity in a friendly font. The view
model has nowhere to put one, and a test asserts its key set stays exactly
`{ sales, since }` so nowhere stays nowhere.

**2. When nothing happened, there is no panel.** Not "0 new", not a greyed
card. `getArrivals` returns `null` and the component renders nothing. An
empty state every morning is a small daily reproach, and a badge would
manufacture obligation out of an empty list.

**3. A refresh is the same visit.** `lastSeenAt` only advances once the
gap exceeds 30 minutes. Without this, reading the panel and pressing
reload would blank it — the player would watch their own news disappear
and have no way to get it back.

**4. Stamping the visit is best-effort and never transactional.** It is a
greeting, not an economic fact. A failed write must never fail the page,
so `touch` swallows its error.

**Consequences.** `User.lastSeenAt` is nullable and the null case means
"first visit ever" — there is no away to report on, so the panel stays
quiet and the stamp is set. The query reads `PLAYER_SALE` ledger rows in
the window rather than any new table, so nothing needs to be written at
sale time and the panel cannot drift out of sync with the till. Adding a
second kind of arrival later means another nullable field on `ArrivalsView`
and another paragraph in the component; the two rules above constrain what
is allowed to become one.

## ADR-39: The Hollow — a deep coin sink that is a picture, not a number

**Status.** Accepted.

**Context.** The economy saturated. An audit of the shipped game put an
engaged player at roughly 503 coins a day gross against a durable sink of
8,614 coins of purchasable goods — one of every item in the game — reached
on **day 18**, or day 33 for a casual player. Of the total 44,114-coin
lifetime sink, **80.5% was player-shop listing-slot upgrades**, which buy
shelf space in a market that, in pre-alpha, has no other sellers and no
buyers; a further 16.5% was curios with no use effect, ten of the thirteen
of which a free button already hands out. Coins that bought something the
player could not otherwise get and could see or use came to **12.4%**.

After day 18 the game keeps minting ~490 coins a day into a number in the
corner of the screen. That is the largest hole in the design, and no
amount of tuning the faucets closes it: the problem is that there is
nothing at the bottom.

The genre's historical answers to this are mostly bad. Paid-entry games of
chance — scratch cards, buy-in wheels, jackpots — are effective and are
gambling aimed at children; CLAUDE.md forbids them. Stat-training by
repeated paid consumable is a spreadsheet bolted to pay-to-win. Rare-item
speculation is not a sink at all: coins move sideways and concentrate.
Bank interest is a faucet wearing a sink's coat. Guild dues become an
obligation within a month. Two were good: permanent visible cosmetics, and
housing when it was actually expressive — and housing failed nearly
everywhere it was tried, for three specific reasons worth naming, because
avoiding them is the entire design:

1. the room was a **fixed-size container**, so once full every purchase was
   a lateral swap;
2. objects were **independent**, so the fortieth was just a fortieth noun;
3. **nobody visited**, so the pride was private and the spend felt like
   talking to yourself.

**Decision.** A personal place — working name **the Hollow**, replaceable
per the undecided-world-concept rule — built out of painted **grounds** you
buy, **airs** that light them, and **furnishings** you stand at authored
anchors.

**1. Local scarcity, global capacity.** Every ground has exactly **eight
anchors**, fixed forever, and anchor count is **not purchasable**. Within a
ground you own more than fits, so arranging is a genuine choice; capacity
is bought by the whole ground. Spending must never be able to make your own
picture worse, and a ninth anchor would. This is the answer to failure (1).

**2. Airs multiply rather than add.** An air is account-wide and free to
switch: buy it once, put it on any ground, as often as you like. So four
grounds and four airs are sixteen readings of the same furnishings, and
**every air purchase raises the value of everything already owned and
everything that will ever be owned**. A fixed-room system structurally
cannot have this property. This is the answer to failure (2).

**3. The same object is worth buying again.** Furnishings are stackable,
flat-priced, and unlimited — three stones make a path, one makes a place to
sit. This is simultaneously the strongest anti-saturation mechanism and the
strongest anti-checklist one: if a thing is worth owning five times, "one
of each" is visibly not the goal and there is no state in which you have
bought everything.

**4. Some things take real time and cannot be bought faster.** A sapling is
a tree in about sixty days; moss spreads over six weeks. Growth is derived
from `plantedAt` on read — the same rule pet needs follow — so nothing
ticks, nothing needs watering, and a player away for a month returns to a
taller tree rather than a dead one. A two-year player looks different from
a rich newcomer in a way coins cannot equalise. Moving a furnishing carries
its clock across; putting it away loses it, which is why `moveFurnishing`
exists at all — rearranging must never cost somebody two months.

**5. Visitors, but nothing that ranks anybody.** `/u/<name>/hollow` shows
the pictures, the captions, and the names of what is standing there. There
is no visit counter — **not even for the owner**, because the moment it is
a number people optimise it — no likes, no ratings, no comments, no
leaderboard, and no featured list. A featured list is a competition wearing
a compliment's clothes. The admiration mechanism is that **everything is
buyable by anybody at a fixed price forever**: the reaction is "where did
you get that", and the answer is always the catalogue and its price. This
is the answer to failure (3).

**6. Nothing here gates anything, and nothing here does anything.** No
furnishing has an effect, a bonus, or a synergy with another furnishing. A
player who never opens their Hollow loses access to no shop, region, item,
or activity. It is entirely a place to put pride.

**7. Not a checklist, enforced rather than intended.** No total, no
percentage, no "12 of 40", no sets, no set bonuses, no rarity tier on any
furnishing, no limited-time windows, no retirement-as-scarcity. The
catalogue is sorted by price and by nothing else. These are not
guidelines: the view models have nowhere to put those numbers, and tests
assert the exact key sets of `HollowView` and `CatalogueEntry`, that no
furnishing carries a rarity above COMMON, and that a rendered page contains
no "n of m" and no percent sign.

**8. Furnishings come from the catalogue and nowhere else.** They are
`tradeable: false` — a resale market recycles coins instead of destroying
them, and invites buying to speculate rather than because you liked the
thing — and content validation refuses any furnishing that also appears in
an NPC shop pool, the prize wheel, the meal pool, a forage spot, a request
board, or the starter pack. That rule protects the sink from a one-line
content edit that looks harmless.

**9. Anchors, not a drag canvas.** Arranging is "tap a place, tap a thing",
two taps. A free-form canvas would be wrong four times over: the thing you
drag sits under your thumb at 360px; it cannot be operated by keyboard or
screen reader without an entire parallel UI; free placement breaks
perspective and scale so the art cannot be painted to compose; and pixel
coordinates become one more untrusted client input. Because the
arrangement is structured data, `describeScene` composes a spoken
description — "The Lantern Clearing, under Low Gold. The middle: The Quiet
Orrery. Underfoot: Steadying Stone. Two places are empty." — back to front,
the same order a sighted visitor's eye travels.

**Prices.** Sized against ~490 coins/day net engaged, ~255 casual. Grounds
run 0 / 6,000 / 18,000 / 45,000 — ground two at about twelve days is
deliberately the *first* rung, because "I saved three weeks for this" is
the beat the genre runs on and it should arrive early. Airs run 0 / 5,000 /
12,000 / 30,000. Furnishings run 180 to 95,000. One of everything plus
every ground and air is 385,890 coins — about 790 days of engaged play,
and 8.7x the entire previous durable sink of 44,114 — and that figure ignores the
axis that actually matters, which is that buying a second Steadying Stone
is a sane thing to want.

**Consequences.** Capacity is bounded by how many grounds have been
painted, and that is the honest limit — adding one is a content-only change
with no migration, as is adding an air or a furnishing. `HollowGround-
Definition`, `HollowAnchorDefinition`, `HollowGroundPrice`, and
`HollowAirDefinition` are seeded content like every other domain, so a
module never imports `prisma/content`. Furnishing-specific data lives in a
`Furnishing` side table keyed by `itemId` rather than as more nullable
columns on `Item`: `ItemType` is the *use-effect* discriminator and a
furnishing has no use effect. Arranging is serialized per player with a
`pg_advisory_xact_lock`, the same mechanism showcase reordering uses, and
placement legality — ownership, spare copies, size, and anchor identity —
is re-read inside the writing transaction rather than trusted from the
form. This is **not** a `LocationActivityType`: a Hollow is not a place in
the world, and putting it in the world model would make the world domain
depend on it.

### ADR-39 corrections (post-review)

An adversarial review of the landed code confirmed four defects by probe.
Recording them because three were failures of *reach* — the rule existed
somewhere in the codebase and simply did not extend to the Hollow — which
is the failure mode a new subsystem is most prone to.

**The kill switch did not reach the Hollow, and retirement reached too
far.** `placeFurnishing` checked only that an item had a furnishing row,
and `composeScene` filtered on nothing at all, so a DISABLED furnishing
kept standing on every public page and could still be newly placed —
against conventions.md's "inert everywhere". Meanwhile `listCatalogue`
filtered `lifecycle === "ACTIVE"` inline and `listPlaceable` was built on
it, so a RETIRED furnishing a player already owned could never be placed,
against "owned copies remain visible and usable". The two lifecycles were
handled backwards at both ends. Now one helper takes an `admits`
predicate: buying asks `isDistributable`, arranging asks `isUsable`, and
rendering asks `isPlayerVisible`. Nothing compares a lifecycle string
inline any more.

**Removing an anchor stranded the furnishing standing at it.**
`HollowPlacement.anchorKey` is a plain string with no foreign key, and the
seeder replaced a ground's anchors wholesale when its authored set
changed. The placement survived, rendered nowhere (scenes are composed by
mapping over anchors that exist), still counted against the player's
placed total so the copy was offered nowhere else, and could not be
reached by any clear control. The furnishing was paid for, invisible, and
unrecoverable — worse than the cascade the seed comment and the README
both claimed. The seeder now deletes those placements explicitly, so the
copy returns to the player's spare pool.

**The three opening furnishings entered circulation with no ledger row.**
680 coins of catalogue value appearing in a satchel with nothing in
`/history` or reconciliation to explain it. They now write a
`STARTER_GRANT` row each, exactly as the starter pack does.

**`moveFurnishing` had no way in.** The command existed, was tested, and
was documented here as the reason rearranging does not cost a player their
growth clock — and no component ever rendered its action, so every
rearrangement in the shipped product went through clear-and-replace and
reset the clock. The anchor sheet now offers "move it to" before "put it
away", listing every empty place across every ground that would take it,
and says plainly that putting it away starts the growing over. Ordering
matters here: the cheap control must not be the destructive one.


### Playtest corrections: the shops now sell what the boards ask for

Four people played the game — a first-timer on a phone, a genre veteran, a
min-maxer, and a keyboard-and-screen-reader player. The veteran found the
structural one, and it was invisible from inside the code:

**The Found Counter stocked six items. The Claims Board standing four
inches below it asked for five. Zero overlap. Not one.** The same held for
the Hearth. So "buy the missing piece" — the oldest and most satisfying
move in this genre — did not exist, the boards could only be completed on
the days foraging happened to cooperate, and a player with 800 coins had
literally nothing to spend them on but the Hollow. Their words: not
confusing, not broken, just **inert**, which is worse.

The fix is content, not code: each board's shops now stock a **subset** of
what that board asks for, priced **above** what the board pays. Every
buyable request now shows a positive NPC cost in the balance report and
none is flagged as arbitrage, which is exactly the intended shape —
buying a whole request always loses, and buying the one piece you are
short of always wins. The subset matters too: leaving some ingredients
unstocked keeps the multi-item requests unbuyable outright, so the
richest rewards still have to be earned by foraging and the meal.

ADR-25's invariant is unchanged and is what made this safe to do: a reward
must never exceed what its ingredients cost from a shop. The rule was
being satisfied vacuously, by nothing being purchasable at all.

**The wheel was the biggest earner in the game and had no decision in
it.** One tap returned up to 500 coins, more than all three word puzzles
together, which taught a new player that the wheel is where money comes
from. Configuration version 2 flattens the curve: top prize 500 → 200,
expected value ~47.5 → ~35.

**The Sorting Bench's ladder was tuned against a simulation, not a
person.** ADR-41 set the rungs from a heuristic search that medianed
3,560. A thoughtful human worked out the real mechanic — a shelf is a
stack that only unwinds from the top, so the question is not "does this
match" but "can this shelf still be emptied" — improved run over run from
0 to 1,190 to 1,820 to 2,180, and was paid **45 coins for the whole day**,
because the second rung sat at 1,800 and the third at 2,800. The middle
rungs now sit where real improvement crosses them (500 / 1,400 / 2,200 /
3,000), so getting better is something you are paid for on the day you get
better. The top rung stays at 3,900, because that is what stops the
trivial fixed-shelf strategy earning the maximum, and that guard is
load-bearing.

**A tap should never cost more than you would shrug at.** The Hollow
catalogue runs to 95,000 coins and every price was a single unconfirmed
tap on a scrolling list on a 360px screen, with no sell-back. Purchases at
or above 1,000 coins now confirm; below that they stay one tap, because a
180-coin stone is meant to be bought five times without ceremony.


### ADR-42: Trading with other players opens after a day

**Status.** Accepted.

**Context.** A playtester who reads games as systems built the obvious
machine and measured it. Twelve throwaway accounts, each signed up
(no email, no captcha), paid its 200-coin starter grant, spun the wheel,
solved the day's **shared** word puzzle from a list of answers, then
bought a junk item from the farmer's stall priced at exactly that
account's balance. **5,834 coins moved in twelve accounts at 21.8 seconds
each — 1,338 coins a minute**, against about 600 for a day of honest
play. Nothing leaked in transit: a batch of nine arrived in the till as
exactly 4,097.

Nothing about the plumbing was wrong. They probed hard for that — double
submits, three-tab races on the wheel, on a listing, on a request, on the
till, back-button replays, refreshes mid-action — and every one was
correctly refused, usually with copy saying what had *not* happened. The
transactional core held. The hole is entirely in the design: free
accounts, plus a coin pipe with no fee, no cap, and no eligibility.

**Decision.** An account must be **24 hours old** before it can list an
item in the player market or buy from another player's shop.

Every other lever is a tax on a machine that still works. A sales fee
takes a cut and the farm carries on. A price ceiling is worked around by
listing twice. A sign-up rate limit slows the farm by minutes. This one
stops it: a mule cannot carry anything on the day it is made, so a farm
has to be kept alive rather than manufactured on demand — which changes
the cost from seconds to days.

**It applies to the player market and nothing else.** NPC shops, request
boards, foraging, the minigames, the Hollow and its catalogue, and shop
capacity upgrades are all open from the first minute. Those move no value
between accounts, and gating them would take a new player's whole game
away to stop a farm they are not running. The first version of this
change did exactly that — it went through the shared `assertCommerceAccess`
and blocked buying a 12-coin sunberry from an NPC — and the browser suite
caught it. `assertPlayerTradeAccess` is now a separate, stricter check
used by exactly two commands: create a listing, and buy from a player
shop.

**Consequences.** A real new player loses nothing they would have used: on
day one you have 200 coins, nothing worth listing, and the market has no
urgency in it. Test fixtures now default to an account a week old, because
an ordinary player is not zero seconds old and treating them as one made
every commerce test a test of the brand-new-account path.

**Was left open, now closed by ADR-44:** the daily word was global, and
the game reveals the answer to a player who fails. That made 210 coins a
day free to anyone who read one forum post, and it is the faucet that made
each mule worth having. The fix named here — a schema change to
`DailyWordPuzzle`'s uniqueness plus a per-player rotation — was the right
one and is now built, keyed to a server secret rather than to an offset so
that mapping the bands once does not buy every future day. The 24-hour
gate remains what stops the *pipeline*, which is the part that scales.


## ADR-40: A companion has private tastes, and the game never states them

**Status.** Accepted.

**Context.** This is a virtual pet game in which the pet was the thinnest
thing in it. A companion is a name, a species, four integers, and a
per-toy cooldown. There are two verbs, both of which are "use an item at
the pet", and neither varies: feeding changed exactly one stat and
produced zero happiness, so an 8-coin broth and a 150-coin cake gave the
identical sentence with a different noun. Every companion of a species was
identical to every other one, forever. Meanwhile the game had two regions,
sixteen locations, four shops, a marketplace, two request boards,
foraging, three daily activities, two minigames, and — as of ADR-39 — a
personal decorated place with 8 anchors × 4 grounds × 4 airs of
arrangement. The title noun had the least to do of anything.

Two species descriptions already promised things the code did not do: one
"grows a new petal for every day it is well cared for", the other's "tail
tip glows softly when it is happy". Nothing grew and nothing glowed.

What actually made a browser pet feel like *yours*, historically, was
never the meters. It was that it reacted differently to the same input
depending on what it was, that it had properties you discovered rather
than were told, and that the knowledge lived in your head rather than in a
panel — which is why people talked about their pets. The genre's other
answers were worse: daily care checklists (retention engineering), stat
training by repeated paid consumable (a spreadsheet with fur on it),
randomised appearance bought with chance (a slot machine that also makes
your companion's identity purchasable), and species-completion grids
(checklists, forbidden here by name).

**Decision.** Every companion has a **palate** — a food taste, a toy
taste, and one thing it is unmoved by — derived from a per-pet seed over
the tag vocabulary the world already uses. The player finds it out by
offering things. The game never states it.

**1. The game never says why.** No view model, action result, log line, or
error carries the seed or the tags, and — the load-bearing part — **the
reaction copy never names the tag**. "Ember loves salvaged things" hands
over the answer key and turns a discovery into a lookup. "Ember has taken
the Knotwork Ball to the far corner and is guarding it from nobody in
particular" leaves the inference where it belongs: in the player's head,
where it can be wrong, revised, and told to somebody else. A test asserts
no palate tag and no seed appears in any serialized view.

**2. Nothing is ever worse than it was.** An indifference is mechanically
*identical* to an ordinary outcome — same hunger restored, same happiness,
only a drier sentence, with the joke pointed at the companion rather than
the player. A player must never be scolded about an item they just paid
for. A unit test enforces that across every (reaction, item) pair the
result is greater than or equal to the pre-palate baseline, so no future
tuning can make owning this feature a downgrade.

**3. The food bonus is flat, not proportional.** +8 happiness for a
delight, +16 for a particular, independent of `hungerRestore` and
therefore of price. Scaling with fill would have collapsed the food
catalogue into "the most filling thing carrying the right tag" — the exact
failure ADR-35 diagnosed for toys, re-introduced through the other verb. A
12-coin cluster on the palate is worth exactly as much for mood as a
150-coin cake on the palate. Toys multiply (×1.5, ×2) because their boost
is already bounded and their variety is already protected by the
90-minute per-(pet, toy) cooldown.

**4. What it loved goes on a shelf; how much it might love does not.**
`PetDelight` is append-only, one row per (pet, item), written at most once
— no count column, because a count is a number that invites optimisation
(ADR-27). The shelf shows what *is*; it can never imply what *isn't*,
because the palate that produced it is never enumerated to anybody. There
is no total, no percentage, and no "3 of 8", and the view model has
nowhere to put one — a test pins its exact key set. Before the first
discovery the shelf renders nothing at all, the same rule ADR-38's
arrivals panel follows.

**5. It is a record, not a schedule.** The palate on day 300 is the palate
on day 1. Nothing decays, resets, or waits; a player away for five weeks
loses exactly nothing, which is what makes it safe to care about. And care
gets *easier* as you learn: happiness decays 48 a day, three plays cover
that today, two cover it once you know what your companion likes. The
reward for paying attention is less obligation, which is the inverse of
every daily-care loop the genre shipped.

**6. Zero coins and zero items are minted.** ADR-39 established that the
economy's problem is oversupply, so the right shape for a pet feature is
one that makes goods the player *already owns* worth more, rather than
another faucet. The only spend it induces is a player probing the palate
with a dozen cheap one-off foods — a couple of hundred coins, once. That
is not a sink and it is not claimed as one.

**7. Every taste has to be discoverable.** Content validation requires at
least three active foods per food tag and two active toys per toy tag in
the palate pools, and that every pool tag exists in the tag vocabulary at
all. Without it, retiring the last salted food would mint companions whose
palate could never be found — a failure nobody would notice for months.

**Consequences.** The palate module is pure and imports no Prisma, the
same discipline `starter-pack.ts` and `play-config.ts` follow, so offline
validation can check it. Its hash needed an avalanche finalizer: plain
FNV-1a correlated the three draws hard enough that two thousand
companions produced thirty-nine distinct palates. The delight row is
written inside the same transaction as the stat update, after the guarded
write, with `createMany({ skipDuplicates: true })` — so a refused meal
leaves nothing behind and two simultaneous first helpings converge instead
of colliding. Reaction copy lives in `src/lib/pet-reactions.ts`, the same
boundary `pet-condition.ts` established: presentation only, no rules,
importable by client components, one place to change wording. The public
shelf is resolved from a username rather than a pet id, so no pet id
starts crossing the public-profile boundary just to render it.

Roughly 200 distinguishable palates today, growing for free with every
tagged item added — which is the structural inversion of a checklist:
knowledge of what your companion likes gets *more* useful as content
grows, where a completion list gets shorter.

## ADR-41: The Sorting Bench's skill premise was false; four shelves, and a real ceiling

**Status.** Accepted. Supersedes parts of ADR-37.

**Context.** ADR-37 shipped the Sorting Bench asserting, in its own source
comments, that "counting what is left is a real skill — that is the
difference between this and a slot machine". That was not true. An audit
proved it by simulation and the repair confirmed it worse than reported:

`SHELF_COUNT` was 5 and `SORT_KINDS.length` was 5, so a fixed "shelf *i*
is always for kind *i*" mapping — no decisions, no counting, no use of the
look-ahead — cleared the whole 60-find deck and scored **exactly 4050 on
100% of 5,000 simulated seeds**, against a top payout tier of 4000. A
greedy player scored 4050 every time too, because with a shelf per kind
greedy degenerates into the same mapping. The maximum daily payout paid
out every single time, to a player who never made a choice.

**Decision.**

**1. Four shelves, five kinds.** No fixed one-shelf-per-kind mapping
exists, so a player must interleave kinds and decide what to bury under
what. Measured over 5,000 real seeded decks, played only from what a
client can see — the board, the find in hand, and the seven-find window:

| strategy | median | p90 | p99 | bust | reaches top tier |
|---|---|---|---|---|---|
| fixed mapping | 2880 | 3460 | 3850 | 4.8% | 0.3% |
| greedy | 3170 | 3850 | 4050 | 1.0% | 7.9% |
| heuristic search | 3560 | 3950 | 4050 | 0.0% | 11.4% |

`SHELF_CAPACITY` stays 6, having been measured at 5 and 4 and rejected: 5
takes nothing from good play and only removes the bottom rungs from a
first-timer, and 4 is punishing enough that even a searching player loses
the deck 42% of the time. `PREVIEW_DEPTH`, `MAX_BATCH`, and `RUN_LENGTH`
are unchanged.

**2. The ceiling is 150, not 75.** The Bench is the only real skill
activity in the game and takes ten to fifteen minutes, while the daily
word puzzle pays 210 for about three. At 75 it was the worst
coins-per-minute in the game by a factor of ten, which made it — in the
economy audit's words — effectively dominated: it granted no items, fed no
board, unlocked nothing, and paid a currency that used to stop mattering
on day 18. 150 keeps the word puzzle the largest single daily, so the
ordering ADR-33 established survives. The tier ladder is 600/20,
1800/45, 2800/75, 3500/110, 3900/150, with the top rung at about the p89
of strong play. Best-of-day structure is untouched.

**3. The claim in the comments is now what is actually true.** Counting
remaining kinds is worth about 40 points of mean score — real, and modest.
It is not the difference between this and a slot machine; the difference
is that a bust is possible, that clears vary in how many leave a shelf
bare, and that the fixed mapping now finishes a full tier short. Saying so
is better than repeating a flattering claim nobody had checked.

**4. The regression is now untestable to reintroduce.** A unit test
asserts `SHELF_COUNT < SORT_KINDS.length` — with the equality explained as
the cause — and plays the naive fixed strategy over 64 fixed seeds,
requiring it to stay below the top tier. It was proven by reverting the
constant and watching it fail. Because `src/lib` may not import
`src/server`, the threshold is a literal there, so a second always-on
guard in the sorting integration suite makes the same claim against the
real tier table and the real shuffle, and the two cannot drift.

**Consequences.** Two pre-existing rules tests genuinely depended on five
shelves and were corrected. A latent flake surfaced and was fixed: with
four shelves a greedy player can bust for a literal zero about once in
2,000 decks, and an integration test had asserted `score > 0` on a random
seed; pinning the seed also turned "repetition pays nothing" into an exact
equality rather than a bound. Structural fact worth recording for anyone
retuning this: in real play every clear is exactly length 3, and cascades
are unreachable — a placement appends, so the resolving run is always the
top suffix and the surviving prefix of a run-free shelf is run-free. Score
is therefore `90 × clears + 100 × emptied + 250 × cleared deck`, maximum
4050, and the actual skill is how many of your twenty clears leave the
shelf bare.

---

## ADR-43: The Leaving Shelf — a free table that is a gift, not a lottery

**Status.** Accepted.

**Context.** The genre's communal free-item table is a well-known shape:
people put down what they no longer need, anybody may take it, and the
table clears itself on a short timer. It is a good idea being run badly
almost everywhere it appears, and the two failure modes are worth naming
because avoiding them is the whole design.

The first is the **scramble**. A visible countdown over free goods
converts a pleasant thing into a refresh race, and the genre's canonical
version is famous precisely for the scramble rather than the generosity.
CLAUDE.md rules out fear-of-missing-out mechanics outright.

The second is the **mule channel**. An hour before this was built, ADR-42
closed a 1,338-coins-a-minute account farm by gating player-to-player
trade behind 24 hours of account age. A brand-new free, instant, untaxed,
uncapped transfer between accounts would have been a strictly better
version of the hole that had just been closed — better because it costs
nothing to use and leaves no listing to price.

There is also an economic reason to want it. Every existing item sink in
the game either returns value (the market) or is a purchase (the Hollow).
Nothing destroys ordinary goods. Item inflation is slower than coin
inflation and so far invisible, but it is monotonic.

**Decision.** One shelf, in the Mossy Market, beside the paid shelves.

**1. Giving is immediate and final.** The copies leave the donor's satchel
in the same transaction that creates the lot. There is no cancel, no
reclaim, and nothing is returned when a lot goes cold — the offering row
*is* the goods, so there is no escrow to leak and no second place the same
quantity is also recorded. The confirmation dialog says the irreversible
part in plain words before the tap that does it. A gift that can be pulled
back is a listing, and a shelf whose lots can be withdrawn is a display
case for bait.

**2. Two hours, presented as freshness.** Lots expire two hours after they
are left. The interface never shows a timer, a deadline, or a number: it
shows one of three words — "Just left", "Left a while back", "Been here a
while". The mechanic is kept because a shelf that never clears is free
unlimited public storage; the countdown is dropped because there is
nothing to miss. Everything on the shelf is an ordinary item obtainable
elsewhere, most of it from the counter three feet away. A browser test
asserts the absence: no "expires", no "remaining", no `m:ss`, no "in 12
minutes", anywhere on the page.

**3. Oldest first.** Newest-first would put the freshest lot at the top
and reward whoever refreshes hardest. Oldest-first puts the things closest
to going cold in front of the person who could still use them.

**4. One copy per lot per player**, enforced by a `(offeringId, takerId)`
unique constraint rather than by a count. A lot of five reaches five
people instead of one fast one, and — not incidentally — a donor cannot
hand a specific account a bulk delivery in a single tap. The take command
has no quantity parameter at all, so there is no number for a client to
inflate.

**5. Both sides carry ADR-42's gate**, plus caps: 10 donations and 5 takes
per player per UTC day, and 40 live lots on the shelf. All three sit far
above what a person clearing out their satchel does in an evening, and
together they make the shelf a worse mule channel than the market it sits
next to: an alt must be a day old, may receive at most five items a day,
and must win each of them off a public shelf that anybody else can also
reach. When the shelf is full, nothing is evicted — the next donation is
refused. Evicting would let a flood of cheap lots push somebody's real
gift off.

**6. No coins, ever.** The shelf moves goods and only goods. Every ledger
row it writes has `coinsDelta = 0`, so no amount of abuse can turn it into
a faucet.

**7. Lazy expiry; no sweeper.** Rows are never deleted. A lot is on the
shelf if it has not expired and has something left; the take transaction
re-checks the same condition against the same clock. The shelf is
therefore correct with no cron, no job runner and no scheduled task, and
the two mechanisms that could disagree — a read filter and a sweep — are
one mechanism. It also keeps the day's caps countable after a lot goes
cold, which a cascading delete would have quietly reset.

**8. Absent from the activity directory.** It has a daily cap, so it
*could* render a "3 left today" chip on the dashboard. That chip would
turn taking other people's spares into a quota to clear before bed.
Generosity listed as a daily chore stops being generosity. The region map
badges the location; going to look is the whole interaction.

**Consequences.** Item destruction now exists: anything nobody takes
within two hours is gone, which is a real sink that costs a player nothing
they were using. The item lifecycle rule is the market's — stackable,
tradeable, ACTIVE or RETIRED — so furnishings fall out for free and
instanced goods keep their provenance out of a surface that mostly
expires. A DISABLED item's lot stops being takeable and then expires
rather than returning, which is the correct direction for a kill switch:
fewer copies, not more. Writing the test for that found the bug — the
first version of the take command filtered the shelf on lifecycle but not
the claim, so a hidden lot was still reachable by id, which is the exact
defect the Hollow shipped once already (ADR-39's repair). The read and the
write now use one rule.

Deliberately not built: a thank-you or donor-reputation counter (giving
becomes a metric, and metrics get farmed), a notification when something
good lands (that is the scramble by another route), any sort or filter by
rarity or value (the shelf rewards walking past, not scanning), and coin
donations.


## ADR-44: The daily word is keyed per account, not shared

**Status.** Accepted. Closes the item ADR-42 left open and supersedes
ADR-23's third point in one respect: the rotation is HMAC-keyed again,
though nothing else about the authored, ordered answer lists changes.

**Context.** The word puzzle paid one answer per difficulty to the entire
player base, and the game deliberately reveals the answer to a player who
fails — a kindness that ADR-33 argued for and still stands. Together those
two facts made the day's three answers a public number by about a minute
past the reset: one account fails on purpose, reads the words, and every
other account solves first-try for 30 + 60 + 120 coins. ADR-42 measured
what that was worth inside an account farm and deferred the repair because
the 24-hour trade gate stops the part that *scales*. The adversarial audit
(docs/security-audit-2026-08.md, residual 1) confirmed it was live and no
worse than recorded, and recommended fixing it properly.

**Decision.** `DailyWordPuzzle` is unique on `(gameDate, difficulty,
band)`. There are 32 bands. A player's band is `HMAC("word-band",
userId) mod 32` — derived, never stored — and a band's answer for a day is
drawn by `HMAC(DAILY_ROTATION_SECRET, "date:difficulty:band:counter")` with
rejection sampling over that difficulty's ACTIVE answers.

**Keyed, not merely banded, and that is the whole decision.** Splitting
the population 32 ways with plain arithmetic — `(day + band) mod pool` —
looks equivalent and is not. An attacker maps each band to its offset
once, from 32 sacrifice accounts on a single day, and from then on
computes every band's answer for every future day at no further cost. The
farm's price would go from one account to thirty-two, permanently paid
off. With a server secret in the derivation there is nothing to solve for:
knowing band 7's word today says nothing about band 8's today or band 7's
tomorrow. The cost is one sacrifice account **per band, per day, forever**
— thirty-two burned accounts to serve a farm each morning, against three
free answers a day before. That is the difference between raising a price
and charging rent.

**A band is not an account column.** Nothing is written to `User`, so
raising `WORD_BANDS` redistributes live accounts with no migration and no
backfill, and an account that changes band simply plays a different word
tomorrow. Existing puzzle rows keep the answer they froze at creation, so
the schedule can change underneath them without rewriting a board anybody
is playing. That same immutability is what makes rotating
`DAILY_ROTATION_SECRET` safe: it changes what future puzzles resolve to and
cannot touch history.

**Consequences and the costs actually paid.**

- **`DAILY_ROTATION_SECRET` is required in production** and validated at
  startup like the other secrets; a development fallback is refused there.
  ADR-23 removed `DAILY_SEED_SECRET` on the grounds that authored order
  beat opaque determinism for a curated daily. That reasoning was about
  *which words appear and in what order*, and it survives intact — the
  lists are still authored, still ordered, still append-only. The secret
  now decides only *who sees which of them on a given day*, which is not a
  curatorial question.
- **The scheduler writes 96 rows a day instead of 3.** Paid deliberately
  ahead of time; the lazy path still creates exactly the one row the
  player in front of it needs, so a first visitor never funds the day.
- **Operator preview is band-scoped** (`puzzle:preview <date> [band]`,
  plus `puzzle:band <username>` to find the one a player is in). Dumping
  all 32 bands for a date would reassemble the leak by operator
  convenience, which is a strange way to lose to yourself.
- **A played band freezes the reward for every band of that date and
  difficulty.** Writing this found a real defect: the old reward edit
  filtered per row on `results: { none: {} }`, which under banding would
  have cheerfully repriced the 31 untouched bands and left the played one
  behind at the old rate. Bands are allowed to differ in their word and in
  nothing else — never in what the day pays.

**What this does not do.** It does not stop a player from failing on
purpose and telling a friend in the same band, and it is not meant to. It
removes the property that made the answer *broadcastable*: there is no
longer a single fact that unlocks the game for everyone who reads it.


## ADR-45: The Wandering Lantern — a daily whose answer is a place

**Status.** Accepted.

**Context.** The game had six things to do each day and every one of them
happened on the page you were already standing on. The word puzzle is at
the reading room, the wheel at the pavilion, the meal at the kitchen; you
go to a page, you press its button, you leave. Meanwhile the world had
sixteen locations carrying carefully written flavour prose that nothing in
the game ever asked a player to read. Two problems, and they are each
other's answer.

**Decision.** One small lamp is tucked away at a single location each game
day. A riddle describing that place — without naming it — is posted at The
Quiet Beacon. A player gets **three looks a day**, taken from any location
page in the world. A find pays 90 / 60 / 40 coins depending on which look
found it, and a miss reports whether the searched location was at least in
the **right region**.

**The riddle is the game; the looks are the safety net.** Blind guessing
across fifteen places with three looks is a 20% coin toss, and a daily
that pays out on a coin toss is a slot machine with extra walking. So the
clue is authored against the location's own description and validated to
be solvable — content validation rejects a published location with no
clue, and rejects a clue that contains its own location's name. The region
hint then means a player who cannot crack the riddle still converges: wrong
region on look one halves the board, and two looks over ~7 remaining places
is a real chance rather than a shrug. A player who *reads* wins on the
first look; a player who guesses usually still wins, later, for less.

**Descending rewards, never a penalty.** Every find pays. The gradient
exists so that solving it outright is worth more than working through the
map, which is the difference between a puzzle and a scratchcard. Missing
entirely costs nothing but the day, and nothing carries over — no streak,
no accumulated penalty, nothing to protect by logging in.

**It is not an activity attachment, and that is the load-bearing bit.** An
attachment says what is hosted *at* a place. The hunt is available
*everywhere*, so modelling it as an attachment would mean listing it on all
fifteen locations and remembering to do so for every location ever added.
Miss one and the lantern could hide somewhere with no way to search it —
a dead day for one band in thirty-two, invisible to the author, reported by
nobody. Instead the notice board is an attachment (`LANTERN_HUNT`, one
key, at the beacon) and the "look here" panel renders from the location
page shell. Searchable set and hideable set are then the same set by
construction. The beacon deliberately has no look button of its own:
brute-forcing the hunt without leaving the page you read the riddle on is
the one thing worth preventing.

**Per-band, for the same reason the word puzzle is (ADR-44).** The answer
to "where is it today" is four words long and travels through a chat window
instantly — worse than the word puzzle, not better. So the hiding place is
drawn per rotation band by the shared keyed rotation, which moved to
`modules/daily/bands.ts` in this change and now serves both. Two
consequences worth stating: the draw is domain-separated by a `purpose`
string, so a band's word never correlates with its hiding place; and
`WORD_ROTATION_SECRET` became `DAILY_ROTATION_SECRET`, because a secret
that keys two activities should not be named after one of them.

**Consequences.**

- **`LanternClue` is the eligibility list, not the world file.** A clue row
  is what makes a location hideable, so retiring a riddle (`active:
  false`) removes a place from the hunt without touching the world, and
  existing hunts keep resolving through their frozen reference.
- **A hunt row freezes its clue at creation**, so a secret rotation or a
  retired riddle changes where the lantern goes *tomorrow* and can never
  move it out from under somebody mid-search.
- **The notice board writes on render.** The riddle is this activity's
  content, so a player arriving before the day's first cron would otherwise
  be told the note is blank with no way to change that. It is the same lazy
  fallback the shops use, bounded to one row per band per day. The
  per-location panel stays a pure read — its *action* draws the hunt — so
  fifteen page types did not become fifteen writers.
- **A repeat look at the same place is refused for free.** It cannot find
  anything the first look missed, and charging a look for a mis-tap would
  be charging for a typo.
- **No item rewards, for now.** Coins only. The find is the moment; adding
  a weighted item pool would double the surface for a feeling the game
  already delivers, and item inflation is a live concern (ADR-43). It is
  deferred, not rejected.

**What this is not.** There is no character who hides the lamp, no
schedule, no one to befriend. It is an object that turns up somewhere else
each morning and a note in handwriting nobody has placed — which keeps it
firmly inside the world model's rule against NPC simulation while still
being the most alive thing in the game.


## ADR-46: Salt chits — a game of chance bought with coins

**Status.** Accepted. **Its published-odds decision is superseded by
ADR-48**; the economic guardrails below still stand.

**A correction to this ADR's original framing, kept because being wrong
in public is cheaper than being wrong quietly.** This document opened by
declaring a tension with CLAUDE.md's ban on loot boxes and then designing
around it. That reading was mistaken: the rule is about **monetized**
randomness — it sits beside "pay-to-win" for a reason — and a game of
chance priced in coins that are earned by playing is not what it
prohibits. CLAUDE.md now says so explicitly. Several of the restraints
below were therefore solving a problem that did not exist, and ADR-48
removes them.

What remains true, and load-bearing:

**No real money, ever.** Chits are bought with coins earned by playing. A
coin-priced random reward is a *sink with variance*, which the prize wheel
already is, for free, daily.

(Points 2-4 of the original — published odds, no blanks, nothing
escalates — were restraints adopted against a rule that turned out not to
apply. ADR-48 replaces them.)

**Decision.** Three tiers — Thin (60), Banded (180), Black (500) — sold at
one new shop, the Raker's Chit Table in The Drying Sheds. Each card carries
its whole prize table as `ScratchPrize` rows whose active weights sum to
exactly 10000 basis points. Scratching consumes one card and grants one
outcome in a single transaction. Cards are ordinary tradeable stackables:
you can gift one, leave one on the shelf, or sell one.

**Expected return is strictly below price, and validation enforces it.**
The shipped tables return about 70%, 72% and 69%. This is the check that
keeps the feature a sink: a card whose expected value reached its price
would be a coin printer with a scratching animation, and one that exceeded
it would be an infinite-money bug wearing a costume. `npm run
content:validate` computes the number, prints it per card next to the
request-board balance report, and fails the build if it reaches the
cheapest price the card can be bought at. **Related refusals:** a chit may
never award a chit (that is the mechanic that turns a curiosity into a
treadmill), never award a furnishing (ADR-39 keeps those to the Hollow
catalogue), and never award more than one of an instanced item.

**Consequences and the smaller calls inside it.**

- **The draw is secure and server-side** (`modules/daily/random.ts`, the
  same helper the wheel and foraging use). No seed to guess, no client
  field to forge, nothing peekable before committing.
- **The card is spent before the draw runs**, under the guarded decrement,
  so a failed scratch cannot consume an outcome and a successful one
  cannot skip paying for itself. Both live in one transaction.
- **A mid-edit table refuses to pay.** If the active weights do not total
  10000 the scratch is declined and nothing is consumed. Paying out
  against percentages the player was never shown is precisely the
  dishonesty this whole design is arranged to avoid.
- **A withdrawn prize item pays its reference value in coins, not
  nothing.** The player bought a card that listed that outcome; an
  operator retiring the item afterwards is not theirs to absorb.
- **The stall never sells out.** Three listings, all three tiers, every
  restock, in quantities well above demand. A chit stall that runs dry
  manufactures scarcity, and scarcity is the one thing a game of chance
  must not be allowed to add.
- **Rate-limited per minute, not per day.** A daily cap on something
  already paid for is a second price, and it would turn "I have six chits"
  into a chore spread over a week. The limit exists to bound automation
  and sits far above human tapping speed.
- **Reconciliation covers it**: every scratch must carry a matching ledger
  row, and must have paid exactly one of coins or an item — never both,
  never neither.

**What would change this decision.** If the game ever takes real money,
this feature comes out the same day, because every argument above depends
on it not doing so.


## ADR-47: Tarnreach — a third texture, and three things to do in it

**Status.** Accepted.

**Context.** Two regions had settled into a pattern worth naming before a
third repeated it. Dapplewood is horizontal and warm and its verb is
*linger*; Saltmere is flat and grey and its verb is *pick through it*. A
third region built the same way — walk about, press the buttons — would
have been more content and no more game.

**Decision.** Tarnreach is vertical, cold, and clear, and its verb is
**sit still**. Eight locations, three of them deliberately with nothing to
do (the world model is explicit that a region where every page has a
button is a menu rather than a place). It gets three new activities, each
chosen because it does something the existing set does not.

**A third terrain, not a recoloured second one.** `PlaceTerrain` gained
`fell`: angular peaks, a dark tarn, cairns on the wings, and the coldest
palette of the three. Reusing `flats` with a new tint would have made
Tarnreach read as Saltmere with hills, which is precisely the failure a
third region is most likely to have.

### Fishing

A close relative of foraging, and separate because of one thing: **a cast
yields one fish with a size**, drawn from the range that species runs to
*in that water*. The size is the activity. It is why you cast again after
you already own the fish, and it is why there are two tarns — the same
char runs 26–45cm in the lower and 40–72cm in the upper, so the extra
hour's walk buys size rather than a different button.

- **Personal bests are private, permanently.** `FishRecord` is per player,
  and there is no query anywhere that takes another player's id. There
  must not be one: a personal best is pleasant because it is yours, and a
  leaderboard makes it somebody else's number.
- **Empty casts are common and are not failures.** The empty outcome
  competes in the same weighted table as the fish rather than being a coin
  flip layered over it, and its weight is deliberately far above a
  hedgerow's. Waiting is what fishing is; a hook that always lands
  something is a vending machine.
- Like foraging it pays in fish and never in coins, so it cannot become a
  faucet. The day is bounded by the unique `(user, spot, date, ordinal)`
  row, not only by a count, so concurrent casts cannot race past the cap.

### The free drink

The Warming Hut hands out one hot drink a game day. Mechanically this is
the community meal with a different pool, and giving it its own domain
module would have been two copies of one transaction to keep in step
forever.

**One schema change made it possible, and it was a latent bug either
way.** `DailyFoodClaim` was unique on `(userId, gameDate)` — one claim per
DAY, not per pool. A second daily of the same shape would have silently
excluded the first: claim your lunch and the free tea reports itself
already taken. It is now `(userId, gameDate, poolId)`.

Drinks are FOOD items carrying a new `brewed` palate taste, so a companion
can turn out to be particular about hot drinks — which is a taste the
kitchen's pool cannot reach, and the reason this is worth having as a
second daily rather than a second flavour of the first.

### The Stonesetter's Table

A matching game at three sizes (6, 10, 15 pairs). The security model is
the Sorting Bench's, for the Sorting Bench's reason: **the client has
nothing worth lying about.** It submits a card index. The server holds the
seed, replays the whole flip log, derives the board, and decides what
matched. There is no "I found a pair" message a browser can send, and the
layout never leaves the server — which is why the UI does not flip
optimistically. Showing a face before the server names it would mean the
client knew it.

- **Payout is once per difficulty per game day**, enforced by a unique
  constraint rather than counted. So a player can sit with it all evening
  because they like it and the economy never notices, and a bot earns
  exactly what a person earns. Totals are 40 / 95 / 190 with the par
  bonus. (This bullet originally said a full sweep stayed under the word
  puzzle's 210. It does not — 40 + 95 + 190 is 325. Corrected in ADR-53:
  the ordering that holds is per-sitting, no single board out-paying the
  word puzzle, not per-day.)
- **An illegal flip voids the run and is audited.** Turning a card that is
  matched, out of range, or already face up is something a legitimate
  client cannot produce, so the run ends rather than being repaired.
  Repairing would mean guessing at intent, and a game that guesses is a
  game that can be nudged. (The browser test caught itself doing exactly
  this by reading the board before the server had answered — the server
  was right and the test was wrong, which is the correct way round.)
- Faces are emoji **plus** position, never colour alone: a matching game
  played on colour is unplayable for a good number of people.

**Consequences.** Three new `LocationActivityType` values, so the
compile-time registry, the map labels, the directory icons and tints, and
the content validator all listed their own work — which is the whole point
of those guards. Fishing is deliberately absent from the activity
directory for foraging's reason: a list of every water with a "4 casts
left" chip turns sitting by a lake into a route to clear before bed.


## ADR-48: The chits get their teeth — blanks, hidden odds, and the pans

**Status.** Accepted. Supersedes ADR-46's published-odds and no-blanks
decisions; keeps its economic guardrails.

**Context.** ADR-46 built the scratch cards under a misreading of
CLAUDE.md, treating the loot-box prohibition as covering any weighted
prize pool. It covers **monetized** randomness — it is listed beside
pay-to-win — and nothing in this game takes money. Four restraints were
adopted to survive a rule that did not apply, and three of them were
making the feature worse for no benefit: published percentages, a
guaranteed payout on every card, and a flat refusal of anything that
escalates. The result was arithmetically honest and completely inert.

**Decision.** Three marks under the salt. Match all three and the chit
pays what that mark is worth. Most chits do not.

**1. Most cards lose (~55%), and near misses are common.** The blank is
the commonest outcome on every tier, and 55% of losing cards show two of
three rather than three unlike. That is not padding: a losing card that
shows three unrelated marks feels like nothing happened, and two-of-three
is what a loss is actually *for*. The same expected return buys either a
lot of small consolations or a few genuinely large prizes, and this now
buys the second — the top coin outcome on a black chit went from 600 to
2,200.

**2. The odds are not published; the ladder is.** A player can see the
Grovewarden's Compass is on the black chit, that the pans are real, and
what the pool currently stands at. How often any of it lands is what the
scraping is for. The weights are still exactly as authoritative as they
were — they are simply nobody's business but the rakers'.

**3. The pans: one shared, world-wide progressive pool.** Every scratch
puts a slice of the card's price in (4-7 bps by tier); the top outcome on
any tier takes the lot. A jackpot that is not shared is just a big prize —
the point of this one is that it visibly accumulates from everyone's
losses until somebody's thin 60-coin chit takes it. It has its own mark
(✹) which appears nowhere else, so two of them is a real near miss on the
pool rather than a coincidence.

**4. The scraping is an interaction, not a button.** Three covered panels,
uncovered one at a time or all at once, and the verdict does not appear
until the player has actually turned all three over.

**The outcome is drawn first and the marks are dressed onto it.** This
ordering is the load-bearing correctness property of the whole rework. The
other way round — draw three marks, read the prize off whether they match
— would make the authored weights a fiction and the real odds whatever the
symbol arithmetic happened to produce. Reconciliation checks the two
agree: three matching marks exactly when the card paid.

**What is kept from ADR-46, and why it is not squeamishness.**

- **Expected return stays strictly below the price**, now counting the
  jackpot slice, because coins put into a pool come back out of it. The
  shipped tables return 78% / 81% / 79%. This is an *economy* invariant: a
  card that pays its own way is an infinite-coin loop with a scratching
  animation. Validation computes it and fails the build. (It earned its
  keep immediately — the first retune came out at 90% on the banded chit
  and was caught before anyone played it.)
- **A chit never awards a chit.** Nesting makes a self-feeding loop that
  never touches the rest of the game.
- **No real money.** Everything above depends on it. If that ever changes,
  this feature comes out the same day.

**Consequences.**

- `ScratchResult` stores the three marks and a `won` flag. Storing rather
  than redrawing is deliberate: a replayed scratch shows the *same* card,
  and a card that changed its face on a refresh is the one thing here a
  player could reasonably call rigged.
- A losing card writes no ledger row at all — nothing moved — so
  reconciliation had to learn that a scratch without a `SCRATCH_PRIZE` row
  is correct when `won` is false, and an error when it is true.
- **The jackpot floor mints coins.** A win against a short pool pays a
  2,000-coin minimum; the shortfall is the only coin this feature creates
  from nothing. Bounded per win, and wins run about one in two thousand
  scratches.
- The action returns state instead of redirecting, and deliberately does
  **not** revalidate: revalidating remounts the tree that owns the native
  `<dialog>`, which closed the card the instant it was scratched. The
  satchel refreshes when the player closes it. (Found by the browser test,
  which is what it is for.)

## ADR-49: The Tumblehouse drums — five tokens, one lever

**Decision.** Add a slot machine at a new Saltmere location, worked by
consumable coloured tokens rather than by coins. Five tiers, priced 120 to
12,000, sold at a counter beside it and occasionally found. Each tier is a
visibly different machine: the pale token puts six faces on the drums and
the black one ten.

**Why tokens rather than coins.** A machine that takes coins directly is a
machine with no floor and no ceiling — a player can feed it their whole
balance in one sitting, and the interesting decision ("which machine do I
play?") collapses into "how much do I bet?". A token is a discrete object
you either have or do not. It goes in the satchel, it can be traded, it
can be found, and holding a black one is an event before you have pulled
anything.

It also gives the restock system something real to do: the chalk token is
the only COMMON in its shop's pool, so it is always on the shelf in small
numbers, while the dearer ones are an occasion. That is a supply curve
expressed in content rather than in code.

**What is published, and what is not.** The prize LADDER, not the odds —
the same choice ADR-48 made for the chits and for the same reasons. A
player can see the Ninefold Compass Rose is on the black drum, and which
face pays it. How often that face comes up three times is something they
find out by working the lever.

Every face on a drum is a real prize. A tier's `faces` count must equal its
number of winning outcomes, checked offline: a drum with a decorative face
that never pays would make the published ladder a lie by omission, and a
prize with no face could never be shown at all.

**The load-bearing detail, again.** The outcome is drawn first, from the
tier's weighted table, and the faces are dressed onto it (`reels.ts`). The
other way round — spin three drums, read the prize off them — would make
the authored weights a fiction and the real odds whatever the face maths
happened to produce. This is the second feature to depend on that ordering
and it is stated in both places for a reason: it is easy to invert without
anything looking wrong.

**The animation is the feature.** The drums stop left to right and the
last one takes the longest. A pair on the first two with the third still
turning is what a near miss *is*, and losing pulls are drawn as near
misses 60% of the time precisely so that moment happens. Timings run
frame-by-frame in JS rather than as CSS transitions, so a re-render
mid-flight cannot restart or desynchronise them — the same reason the
prize wheel does it that way. `prefers-reduced-motion` collapses the
sequence to a short simultaneous settle with an identical result.

**Tuning.** Roughly three pulls in four lose, and the two commonest wins
are worth less than the token. Expected return lands at 74-77% across the
tiers, printed by `npm run content:validate` alongside the losing share —
both, because they move independently and a tier can hold its return
steady while quietly becoming much meaner.

**What binds.** Expected return stays below the token price, checked
offline, for the reason the chits give: a token that paid its own way
would be an infinite-coin loop with a spinning animation. The drums never
award a token or a chit, because a machine that pays out its own fuel is a
treadmill.

**Consequences.** Fourteen ULTRA_RARE curios were added to give the top
end somewhere to point — before them the catalogue stopped at 2,500 coins
and a 12,000-coin token was unpriceable. None of them do anything: no use
effect, no stat, no unlock. A rare item that made the game easier would be
pay-to-win wearing a nicer coat.

`SpinToken.tier` is deliberately **not** unique at the database. Two
tokens claiming one tier is a content mistake, and content mistakes belong
in offline validation where the whole set is visible; a unique index also
made the five shipped tiers the only five that could exist in any
database, including a test one.

## ADR-50: Reading to a companion, and a meter that only goes up

**Decision.** Books are a new item type, consumed by reading them aloud to
a companion. The pet keeps the title on a shelf forever, and gains
*insight* — a running total, shown as a named band.

**Why the book is destroyed.** It sounds harsh and it is the point: you
are not stockpiling books, you are building a record of evenings. The
shelf is what you keep.

**Insight is not a fifth need.** Hunger, happiness, energy and health are
0-100 snapshots that decay from a timestamp and can be neglected. Insight
only ever accumulates and is never capped. A companion that got less
clever because nobody visited for a week would be exactly the punitive
inactivity mechanic CLAUDE.md rules out — so the meter cannot express it.

**On the band names.** Every band is a compliment, including the first. A
companion nobody has read to is *Curious*, which is true and is the reason
you would start. There is no band that calls an animal stupid, slow, or
empty: a meter that opens by insulting your pet is a meter nobody wants to
look at. A test pins this.

**Re-reads are worth a fifth, floored at one.** The shelf is a list of
*titles*, so breadth is what teaches. Without this, buying one cheap book
a hundred times would be the most coin-efficient way to raise the meter,
and grinding the same page at an animal is not the activity anyone wanted
to build. Rarity raises the first-read value far more slowly than it
raises price: twenty cheap books beat one expensive one, which is both the
better play and the nicer thing to do.

**The shelf has no denominator.** No total, no percentage, no "12 of 20",
and no query anywhere that enumerates the titles NOT on it. The catalogue
of books is content and the shelf is history, and the two are never joined
(docs/profile-and-showcases.md). This is structural — the view model has
nowhere to put a total, and a test pins its key set.

**A book is destroyed, and therefore cannot carry provenance.** Two of the
twenty were first authored `stackable: false` with a provenance policy,
which made them **unreadable**: `removeItem` decrements `InventoryEntry`
and nothing else, an instanced item has no inventory row, and so a
7,500-coin book could be bought and then refused forever with "you don't
have one". The rule now lives once, over every consumable type at once
(`prisma/seed/validation.ts`), rather than as a separate copy per feature
— which is exactly the shape that let books miss it while the chits and
the tokens each had their own. Provenance is the history of an object's
ownership; an object destroyed on use does not have one.

**Consequences.** `Book` is a side table keyed by itemId rather than
another nullable column on `Item`, for the reason `Furnishing` gives:
`ItemType` is the use-effect discriminator, and Item was already growing
one nullable number per kind of thing. Reading writes stats under the same
`statsUpdatedAt` guard feeding uses, so two concurrent care actions both
apply rather than one silently overwriting the other.

## ADR-51: The Morning Slate — one sudoku a day, for everybody

**Decision.** A daily 9×9 sudoku at medium difficulty, the same grid for
every player, at a new Tarnreach location. Generated once per game date
and then read.

**Why a library.** `sudoku-core` (MIT, no dependencies, ships types) does
the generating, solving, and difficulty grading. A generator that
guarantees a unique solution *and* lands on a target difficulty is a
solver plus a rater plus a hole-punching search, and none of that is this
game. The library's grader is consulted rather than trusted: a board is
accepted only if it reports medium AND a unique solution, retried up to
twelve times, and the grade it actually got is recorded on the row.

**Why one row rather than a seed.** The generator is not seedable, so
"the same for everyone" is guaranteed by there being exactly one row —
not by hoping two runs agree. The first player to look chalks the grid;
the write races under the primary key and the loser re-reads the winner's
row, so a thundering herd at midnight settles into one puzzle. No
scheduler is involved.

**What the server will and will not say.** It adjudicates completion and
nothing else: the grid is right, or it is not right yet. It never says
*which* cell is wrong, because "which cell" is the solution handed over
one call at a time. `solution` is server-only and appears in no view
model, log line, or error.

That restraint costs the player nothing, because conflict highlighting — a
repeat in a row, column, or box — needs no solution at all. It is pure
arithmetic in `src/lib/games/sudoku-grid.ts`, runs on the client, and
marks a mistake the instant it is typed.

**Trusting the client with 81 characters.** Entries are saved as they are
typed so a closed tab loses nothing, and the client submits the whole grid
rather than a cell patch — 81 bytes, no ordering rules. `withGivens`
re-imposes the puzzle's own clues over whatever arrives, at every path,
so a forged digit in a given cell is silently discarded. The only cells a
browser can change are the blanks, which is exactly the authority a person
has in front of a real slate.

**The reward is flat.** Once per player per game day, guarded by a status
transition rather than a count, so two submissions racing cannot both pay.
Deliberately not scaled by time or by how few checks it took: the game
never ranks one player against another, and a reward that paid more for
being fast would turn a quiet morning puzzle into a race against people
you cannot see. A personal best time is kept and shown only to its owner.

## ADR-52: Two privileged roles, ranked, before any of the social features

Moderation needs somebody to do it, and a boolean `isAdmin` had already
been standing in for "privileged" since the debug screen shipped. Adding
forums makes that inadequate in a specific way: the work of moderating —
hiding a post, locking a thread, closing a report — is work you want to
hand to a trusted player, and the boolean makes handing it over identical
to handing over the economy.

So `User.isAdmin` is replaced outright by `User.role`, an enum of
`PLAYER < MODERATOR < ADMIN`. The pre-alpha policy applies: no
compatibility column, no adapter, the boolean is gone.

**Every check is "at least", never equality.** `src/lib/roles.ts` holds
the ranking and the comparisons, is pure, and is imported by both the
navigation and the server so the two cannot disagree about who sees what.
An administrator therefore passes `requireModerator`, and the reverse does
not hold — a moderator fails `requireAdmin` and every service in
`src/server/modules/admin/operations.ts`, all of which touch coins, item
lifecycle, or accounts.

The asymmetry is the entire reason there are two roles rather than one,
and it is fragile in a predictable way: the natural-looking
`role === "MODERATOR"` is an exclusion of the administrator wearing a
permission check's clothes, and the usual repair is to give one person two
roles, which is how a ranked field decays into a bag of flags. A static
test in `src/server/actions/admin-gating.test.ts` fails the build on that
comparison anywhere under `src/`. Asking from the bottom (`!== "PLAYER"`,
used to decide whether to show a badge) is fine: it stays correct when a
role is added above.

**Gating is one function per level, and pages are not a permission
model.** `requireAdmin` and `requireModerator` both sit in
`src/server/auth/session.ts` over a shared `requireRole`, and a signed-in
player who fails one is redirected home rather than to sign-in — they are
authenticated, just not authorised. Every privileged page calls one, and
so does every action behind it, because a server action is a public
endpoint reachable by anyone who knows its id; not being linked in the
navigation protects nothing.

**What this ADR does not do.** It does not give moderators anything to
moderate yet. Six surfaces already carry player-written text — usernames,
pet names, profile bios and showcase titles, furnishing captions, and
player shop names and descriptions — and none of them has a moderation
path today. Covering them is deliberately deferred to the moderation
queue, where a subject registry will have a real consumer to be shaped by,
rather than being guessed at now and reworked when the forum lands.

## ADR-53: The Morning Slate gets bands, and three claims about the economy get corrected

A six-month economy simulation against the real domain modules — four
archetypes, 182 game days, 4,822 coin-moving ledger rows — found the
Morning Slate re-opening a farm that ADR-44 and ADR-45 had already closed
twice, at double the price.

**The farm.** The word puzzle was cut from 850 to 210 *and* split across
32 secret-keyed rotation bands because one sacrifice account leaked the
day's answer to everybody. The lantern hunt got the same treatment for
the same reason. ADR-51 then shipped a daily whose answer is an
81-character string, identical for every player alive, worth **420
coins** — twice the reduced word puzzle, with none of the machinery. A
solved grid *is* its answer: nothing to interpret, nothing to adapt,
paste and collect.

It measured as the largest faucet in the game: 390 coins per active day
for a daily completionist, **35.4% of all income**, 1.9× the next
activity.

Forums are the reason this could not wait. The leak needed a
distribution channel and we were about to build one.

So the slate is banded like the other two. `SudokuPuzzle` is keyed by
`(gameDate, band)`, a player's band comes from `bandForUser` exactly as
elsewhere, and the scheduler chalks all 32 grids for today and tomorrow
rather than one. A leaked grid is now wrong for 31 of 32 players, and the
cost of farming is one burned account per band per day, permanently.

Two consequences worth stating:

- **`SudokuAttempt` stores its band** rather than re-deriving it. Deriving
  on read would hand a player a different grid mid-solve if
  `ROTATION_BANDS` ever changed, orphaning their entries against it.
- **Generation is 32× the CPU and runs sequentially.** It is a synchronous
  CPU-bound search; running the batch concurrently would be the same total
  work with the event loop blocked throughout. Each band takes its own
  advisory lock, so a cold band costs one player one grid and never the
  whole date.

**Three false claims, corrected rather than papered over.** The same
audit found the code asserting an economy ordering that arithmetic does
not support:

- `matching-rules.ts` and ADR-47 both said a full sweep of the three
  matching boards came in "below the word puzzle's 210". 40 + 95 + 190 is
  325. The ordering that actually holds is per-sitting: no single board
  out-pays the word puzzle, and clearing all three is three sittings.
- `sorting/config.ts` said "the word puzzle remains the largest single
  daily". It has not been since the slate landed at 420. What the slate
  does not beat is the word puzzle's *rate* — 420 for fifteen minutes
  against 210 for three — which is the comparison that ceiling was
  always really about.

**And the odds report was flattering itself.** `content:validate` valued
item prizes at reference price and counted the jackpot slice, then
printed the total as "expected return". Neither is coins: there is no NPC
buyback anywhere in the game, so an item prize becomes coins only through
a player-to-player sale, which is zero-sum for the world, and the jackpot
pays out of a pool the players filled. The printed figure ran 5–15 points
optimistic — 78% against a real 68% for the thin chit. Both numbers are
printed now. The guard still checks the total, which is the conservative
direction: total below price implies coins below price.

**Not decided here.** The simulation also found that three of four
archetypes spent **zero coins in six months** — the sink-to-faucet ratio
excluding the one gambler is 0.000, because free food outpaces decay,
toys are not consumed, and the player market takes no commission. That is
an economy design question rather than a defect, and it is left open.

## ADR-54: Hunger and happiness get the floor health already had

ADR-35 cut decay from 4/hr to 3/hr because the home screen was telling an
attentive daily player they were failing: hunger fell 96 against a ceiling
of 100, so somebody logging in every twenty-four hours arrived to
"Starving" every single day with no play pattern that could avoid it.

That argument was made against a once-a-day cadence and stopped there. A
six-month simulation of a twice-a-week player found the identical
reproach one cadence out. Hunger zeroes 33 hours after a visit and then
sits at 0 for the remaining two days, so a player who opens the game on
Tuesdays and Saturdays sees "Starving" and "Downcast" every time, always,
no matter what they do while they are there.

No rule in CLAUDE.md was broken — nothing died, everything recovered, and
their earnings per active day were identical before and after a lapse.
It was the tone that was wrong, and it was wrong in exactly the way
ADR-35 already rejected.

So `NEED_DECAY_FLOOR = 15` now bounds hunger and happiness the way
`HEALTH_DECAY_FLOOR = 20` has always bounded health. 15 is the bottom of
the second condition band — the same band the health floor lands in — so
all three meters now agree that the worst a companion looks from absence
alone is "needs you", never the bottom of the scale.

Two things this deliberately is not:

- **It is a floor on decay, not a minimum on the stat.** A companion fed a
  little and left alone stays where it was put; time never tops a stat up.
- **It does not disable the health mechanic.** Health declines once hunger
  "runs out", and running out now means *reaching the floor* rather than
  reaching zero. Had those stayed separate, a floored hunger could never
  reach zero, health would never decline, and the health meter would have
  become decoration. Everything downstream of an empty stomach happens
  exactly when it did before — about five hours earlier, since the floor
  is met before zero would have been.

The daily loop is untouched: a once-a-day visitor still arrives at 28
hunger and still has every reason to feed, play, and read.

## ADR-55: The market takes a cut, and the coins are destroyed

The six-month economy simulation behind ADR-53 found something the
banding fix did not touch: **three of four archetypes spent zero coins in
six months.** The daily completionist went from 200 to 200,756 and their
balance never fell once in 182 days. Excluding the single archetype that
gambled, sink over faucet was **0.000**.

Nothing in the game requires coins. Free food outpaces decay, toys are not
consumed, and the player market took no commission at all — the buyer's
debit landed 1:1 in the seller's till, so trade moved coins sideways and
never out. Total one-off sink capacity (grounds, airs, one of every
furnishing, shop upgrades) is about 525,690, roughly sixteen months of a
completionist's income, after which there is nothing left to buy.

A commission is the only sink that scales with wealth and needs no new
content: the more the economy trades, the more it removes. Every
alternative considered was a recurring charge — upkeep, consumable toys,
rent — and docs/design-philosophy.md does not allow the game to bill a
player for having played it.

**500 basis points, and four rules that matter more than the rate:**

1. **The coins are destroyed, not redirected.** No treasury, no NPC till,
   no pool. Money that moves somewhere is not a sink, and a visible pile
   of confiscated coins invites a feature to spend it.
2. **The buyer pays the sticker price.** The cut comes out of the
   seller's proceeds. Charging a fee on top would make every listed price
   a lie to the person paying it.
3. **It rounds down, in the seller's favour.** A sale under 20 coins pays
   nothing, because 5% of 19 is 0. That is fine — the sink exists for
   wealth, and a player trading trinkets is not the problem it solves.
4. **The seller is told before they set a price**, on the listing form,
   from the constant rather than a hard-coded number in copy.

**Keeping it reconcilable.** `lifetimeRevenue` stays GROSS so it keeps
agreeing with the sum of the buyer-side ledger rows, which are immutable
and are the only honest record of what was charged. The cut is tracked
separately in `lifetimeCommission`, and reconciliation now reads
`till = revenue − commission − claims`.

A counter that only agrees with itself proves nothing, so each
`PLAYER_SALE` row records the exact amount taken from that sale and
reconciliation sums those rows independently (`commission-mismatch`).
That row-level record is not redundant: the cut is rounded per sale, so
re-applying the rate to a summed total would not reproduce it.

The per-user wallet invariant is untouched. The cut never enters or
leaves a wallet — it is subtracted before the till, and the till has
never been wallet money — so `wallet − Σledger = starting` holds exactly
as before.

**What this does not fix.** A commission bites in proportion to how much
a player trades, and the completionist in the simulation traded nothing
at all. Their surplus is still unspent. The remaining answer is content
worth buying, which is content work rather than an economy rule.

## ADR-56: Forums, and moderating them with one moderator

Alpha needs somewhere asynchronous for players to talk. The shape of that
is not the interesting decision — boards, threads, posts, everyone knows
what a forum is. The interesting decisions are all about what happens to
words after they are written, and who is allowed to do it.

**Boards are authored content; everything else is written by players.**
Boards live in `prisma/content/forums/` beside shops and request boards,
seeded and referenced by a stable slug. Four to start, deliberately few:
a forum that opens with twelve boards has eleven empty ones, and an empty
board reads as a dead game. Removing a board deactivates it rather than
deleting it — threads point at it with `onDelete: Restrict`, and what
people wrote is not disposable because an author changed their mind about
a category.

**The opening text is a post, not a column on the thread.** Editing it,
withdrawing it, reporting it, and moderating it then need no special
case. The one thing that is special is withdrawal: taking down the
opening post takes the thread with it, because the alternative is a
thread whose subject nobody can read and whose replies answer nothing.
Replies stay — they are other people's words.

**Nothing is ever deleted.** Withdrawing and removing set a visibility
and keep the row and the body. A moderator has to see what they acted on,
a reporter has to be answerable honestly, and a thread that hard-deletes
a post silently renumbers the replies answering it. A post that is not
visible keeps its place and loses its words, so the gap reads as what
happened.

**Post-moderation, not pre-moderation.** Everything is visible when
posted and comes down afterwards. A queue nobody staffs is a forum nobody
can use, and during alpha there is one moderator who is also the person
building the game. The cost is paid in three places:

1. **A report snapshots the body.** Without it an author could post
   something, be reported, edit it into something harmless, and the
   moderator would open the queue and find nothing wrong. The queue shows
   what the reporter saw next to what it says now, and flags the
   difference.
2. **Rate limits are the whole anti-abuse story at post time**, since
   nothing waits in a queue. Starting a thread is held tighter than
   replying — a flood of threads buries a board's front page, where a
   flood of replies buries one conversation. Editing is limited too: an
   unlimited edit loop on a popular post is a billboard.
3. **Every moderator action is recorded before it is applied**, in the
   same transaction. A trail written afterwards has a gap exactly where
   something went wrong.

**Edit and withdraw are different rights.** An author may edit for thirty
minutes — not a punishment, but it stops the record being rewritten under
a conversation where somebody has already replied to what the post used
to say and cannot notice it changed. Withdrawing has no window at all:
taking your words back is always allowed, silently replacing them is not.
A moderator is **not** exempt from the ownership check; editing another
person's words into different words is not moderation, and the tools
remove or hide rather than rewrite.

**Withdrawn and removed stay different facts.** A moderator cannot
restore a post its author withdrew — that would be overruling a person
about their own words. The consequence is that an author's withdrawal is
irreversible, so the interface makes it two deliberate taps with the
consequence stated, rather than one button on a phone.

**Reading is role-aware in the query, not the page.** `getThreadPage` and
`getBoardPage` take the reader's role and withhold the body themselves,
so a removed post cannot leak through a surface that forgot — including
surfaces nobody has written yet.

**Bodies render as text.** `whitespace-pre-wrap`, no markdown, no HTML.
There is no parser between what was typed and what is shown, and
therefore nothing to inject through. Formatting can be added later; a
sanitiser bug cannot be removed later.

**Removal reasons are never shown to players.** A notice that explains
itself invites an argument with the notice. The person whose post it was
should be talking to a moderator, and the reason is there for the other
moderators.

### What is deliberately absent

No private messages, no signatures, no avatars in-thread, no reactions,
no quoting, no editing history, no user blocking. Each is a real feature
with a real moderation surface, and none of them is needed to find out
whether people want to talk here at all. Reporting exists because the
alternative to reporting is nothing.

The six surfaces that already carry player-written text — usernames, pet
names, profile bios and showcase titles, furnishing captions, and player
shop names and descriptions — still have no moderation path. ADR-52
deferred that until the subject registry had a real consumer; it now has
one, and covering them is the next piece of work rather than a solved
problem.

## ADR-57: One directory, called Activities, and three interface repairs

**Status.** Accepted.

**Context.** Six pieces of player feedback from one sitting, four of them
the same shape: the interface said something in the wrong place, or said
nothing at all.

### The directory lived in two places

The home page and `/games` rendered the same rows from the same query
(`getActivityDirectory`). Two copies of one list is two places to check,
two places to be stale, and — because the directory sat above the feeding,
playing and reading sections — it pushed the companion's own page below a
list that already had a tab of its own.

The home page now shows the companion and the Hollow; the directory is the
tab. The Hollow stays on the home page deliberately: it has no reset and
nothing waiting to be claimed, so listing it among things that expire
would make it feel like one.

**The tab is "Activities" and the route is `/activities`.** Half of what
is listed is not a game in any sense a player would recognise — foraging,
a request board, a free drink, a walk to look at the lantern — and calling
the tab Games quietly asserted that the puzzles were the point and the
rest was filler. The route was renamed with the label rather than left
behind: a `/games` URL under an Activities tab is the kind of drift that
is free to fix now and never gets fixed later. Pre-alpha, so no redirect
was kept (see the compatibility policy in CLAUDE.md).

### A missed pair was invisible

The stonesetter's table resolves a turn on the second flip — two stones
never persist face up — so the response for a miss already had both stones
face down. Turning the second stone therefore showed the player *nothing*:
you tapped, and the board looked unchanged. The only way to learn a face
was to turn a stone and then turn something else.

The view now carries `lastTurn`: the two cards of the resolved turn and
what was under them. The client holds a miss up for 900 ms, blocks flips
for exactly that window, and then releases it. This reveals nothing
unearned — the player turned both stones, and being shown what you turned
is the entire game.

Three consequences worth naming:

* The hold is keyed on **run id plus flip count**, not on the response
  nonce. The nonce advances on every response including failures, and a
  failed flip refreshes the run from the server — same finished turn, new
  nonce — so a nonce guard would replay a hold the player already watched.
* A held stone is a **third board state** and is labelled `, no match`.
  Calling it "showing", like a stone awaiting its partner, is a board that
  lies about whose turn it is, and it made the e2e player answer a turn
  that was already over.
* The live region announces the resolved turn from `lastTurn` for the same
  reason. Reading only `faceUp` told a screen-reader user the turn count
  had moved and nothing whatever about the two stones they had turned.

### Two notices in the wrong place

The lantern's "not here" answer was redirected on the shared `?notice`
key, which the location page renders in a banner at the top. On a page
whose lantern card is at the bottom — the sudoku location, with a
nine-by-nine grid between them — the answer to "is it here?" appeared a
full screen away from the button that asked. It now travels on its own
`?lantern` key and renders inside the lantern card. Its tone comes from
the hunt's own state rather than from matching words in the message,
because the query string is player-editable and copy gets reworded.

The prize wheel re-animated a spin from minutes ago whenever anything
revalidated the route — looking for the lantern on the wheel's own page
did it. The animation effect depended on a memoised `segments` array
derived from the view, so a fresh view produced a new array and re-ran
the effect. Fixed with the same nonce guard, plus moving
`cancelAnimationFrame` to an unmount-only effect: the old cleanup killed
an in-flight spin on every re-render, and with the guard in place the
re-run would have declined to restart it.

### The two economy-adjacent bits

**"Buy tokens" is gone from the drums.** It linked to the page it was
already on — the counter is the next attachment down at the same location
— so it scrolled a few hundred pixels and called it navigation. Worse, it
was a primary-shaped call to spend put in front of a player at the exact
moment they had run out, which is the moment this game has no business
pushing them. A quiet line of text says where the counter is.

**The debug screen can grant coins.** It runs through `adminGrantCoins`,
the same audited command the operator CLI uses, rather than a second path:
wallet credit and ledger row in one transaction, so the reconciliation
report the same page renders stays clean. There is deliberately no
matching debit — that has to be guarded against a wallet that has already
spent the money, and a debug tool that can leave the ledger lying is worse
than one that only goes up.

## ADR-58: The game stops naming a gap without naming the route

**Status.** Accepted.

**Context.** A playtest — a fresh account played through at 360px, then
fast-forwarded a day, a week and a month by moving the player's own
timestamps and game-date rows back — found several dead ends with one
shape in common. The game repeatedly told a player what they lacked and
never told them where to get it.

### The dead end, in three places

`/items/honey-oat-biscuit`, for a player who owns none, said: the flavour
text, an estimated value, "You don't own any of these yet", and "Nobody is
selling this right now." That was the entire page. It never said an NPC
shop stocks it, and the empty player-market section reads as
*unobtainable* rather than *try a shop*.

This is not a curiosity, because the request boards run on it. A new
player's first request asks for two Honey-Oat Biscuits — and the item's
name on that board was not even a link. The game named a thing, told the
player to go and get it, and offered no way to find out what it was.

Home's empty states had the same asymmetry, visible in one screenshot: the
book shelf said "The Quiet Bindery in Dapplewood sells nothing else" while
the food and toy boxes said only that such things "will show up here" — to
a player with no coins and a hungry companion, on the page where they were
standing.

**`modules/items/sources.ts`** is the fix: a query that answers "where does
this come from" from shop pools, forage and fishing spots, the wheel, the
meal, and chit/drum prize tables. Two rules make it safe:

* **It names PLACES, never probabilities.** Every row it reads carries a
  weight; none of them reaches the page. A shop "stocks this sometimes" —
  not 40% of restocks. That is the same line ADR-48 draws for the chits and
  the drums, and there is a test that fails if a weight ever appears in the
  serialized output.
* **It is not a checklist.** It answers a question about a thing the player
  is already looking at. It never enumerates what they are missing, never
  counts, and never appears as a list of things to go and get.

### The starter screen had a default

The first species arrived ticked and highlighted before the player touched
anything, under copy reading "Choose warmly — they will be with you for a
long time" and "names are for keeps". Anyone who scrolled to the name field
and pressed the button got a companion they never chose, on the most
permanent decision in the game. There is no default now; the radios stay
`required`, and the server refuses a submission without one.

### Not-found dropped the whole application

The root `not-found.tsx` renders a bare card: no navigation, no wallet, no
wordmark, one "Head home" link. Correct for a stranger who mistyped the
domain; wrong for a player who followed a stale bookmark to a renamed
location, who on a phone was ejected from the app entirely.

A `not-found.tsx` in the `(game)` route group is wrapped by that group's
layout, so anything under it that calls `notFound()` keeps the tab bar it
arrived with. Genuinely unrouted paths still fall through to the root file,
which is the right split.

### Smaller repairs from the same pass

* **The Hollow's ground buttons read "Take on it"** to a sighted player:
  the ground's name was `sr-only` and an `aria-hidden` "it" stood in its
  place, so a screen reader heard a better label than the screen showed,
  and three six-thousand-coin purchases were visually identical. The name
  is visible now.
* **Three history rows said only "Starter pack"**, because the note
  repeated the row's own type label. The Hollow's opening grant one module
  over already named its furnishings; the satchel grant now does too.
* **The Quiet Beacon printed the lantern's look count twice** — once from
  the notice board, once from the always-on look panel. The panel is
  `terse` there rather than absent: the beacon is also a hiding place, and
  a page with no button is a lantern that cannot be found on the days it
  is there.
* **"· 500 pays more"** on the Sorting Bench is now "a score of 500 pays
  more". It was a bare number with no unit and no verb.

### What the playtest confirmed was right

Recorded because it is as useful as the defects. After 37 simulated days
away the companion was Hungry / Glum / Peaky and no worse — recoverable,
with no streak lost and no penalty anywhere, which is the product rule
holding under test rather than in principle. The daily reset was clean, the
request boards correctly refuse before the goods are held, region maps
badge what each location carries, and nothing overflowed at 360px.

One measurement worth keeping: a slate cell is 31×31 px at 360px. Nine
columns cannot exceed about 36, so it is structural — above the WCAG 2.5.8
AA minimum and below the comfortable target, mitigated by the number pad
(54×44), arrow-key navigation, and the selection ring from ADR-57.

## ADR-59: The Sunken Stair — ten doors, one go a day

**Status.** Accepted.

**Context.** A daily with real stakes and no skill floor: ten rooms, two
ways on out of each, one of them right. Caches at every second room, a
large one and something from the hoard at the bottom, and a wrong door
ends the day's descent.

### The doors are drawn per player, per day, and that is the whole design

The word puzzle and the lantern hunt both needed rotation bands (ADR-44)
because each has ONE answer a day that any player can post. This has none.
The correct door at every depth comes from a random seed stored on the
delve row, so two players comparing notes learn nothing, and a player
describing their whole route in the forums helps nobody — including
themselves tomorrow.

That makes this the first daily in the game that is safe to talk about,
and it is the reason the descent can be a fixed narrative order (entrance,
then down, then the hoard) rather than a shuffled set: the ORDER is public
and the ANSWERS are not.

**The seed is random per delve rather than derived from the player and the
date.** Derived is cheaper and is the wrong trade: one leaked secret would
expose every player's cave for every past and future day at once, where a
random seed leaks exactly one descent that is already over.

### What the client is told

The room it is standing in, the two labels on its doors, and the steps
already taken. Never a room it has not reached, never the seed, never
which door is which. A test asserts the seed appears in no serialized
view, and the browser spec asserts it appears nowhere in the page —
because that is the single thing that would end this activity.

The client sends a door and the depth it *thinks* it is at. The depth is a
guard rather than an instruction: anything that is not the room the server
has the player in is refused, so a stale second tab cannot advance a
descent nobody is looking at, and a script cannot name room ten.

### Being seen off keeps everything found

A cache is paid the moment it is found, in the transaction that records
the step that found it. A wrong door at room seven ends the day and leaves
the player with what rooms two, four and six gave them. Nothing in this
game takes back what it gave, and a descent that emptied your pockets on
the last door would be the most punitive thing in it.

The once-a-day rule is `@@unique([userId, gameDate])` — not a count, not a
check-then-insert. Two concurrent attempts to start collide on the
constraint and exactly one row exists.

**Ordering that had to be corrected.** The stale-room and delve-over
guards were originally above the idempotency wrapper, which read correctly
and was wrong: a replayed submission — a double tap, a retried request,
the exact case idempotency exists for — found the descent one room further
on and was told "you've moved on from that room". Every state-dependent
check now lives inside the idempotent body, so a genuine replay returns
the stored result before reaching a guard it is bound to fail. The test
that caught this is `replays a repeated submission instead of taking two
steps`.

### The arithmetic, and the open question

Each room is an even choice, so reaching depth N has probability 1/2^N.
With caches of 40 / 120 / 400 / 1,200 / 6,000:

    40/4 + 120/16 + 400/64 + 1200/256 + 6000/1024 ≈ 34 coins per attempt

Deliberately modest — below every other daily, because unlike them it asks
for no skill and no time. What it sells is ninety seconds of nerve.

**The hoard is reached on 1 attempt in 1,024**, or about once every three
years of playing every single day. Stated plainly in
`modules/cave/config.ts` rather than buried, because it is the number to
change if the ten things at the bottom should ever actually be seen. The
balance audit flags exactly this shape elsewhere (the 0.01% drum faces are
unreachable by any individual), and the same objection applies here. The
options, none of them taken yet:

* Shorten the descent, or make only the last few rooms a coin toss.
* Give the rooms a readable tell, turning it from a gamble into a puzzle —
  which is a different activity, and not the one that was asked for.
* Accept that the hoard is a lottery and let the market distribute it: the
  items are tradeable precisely so a player who never reaches the bottom
  can still hold one.

Left as built, and flagged, because the choice is a design preference
rather than a defect.

### Content rules with teeth

**The two doors in a room must be symmetric.** A pair like "the dry
passage" against "the flooded one" is not a choice: one reads safer, every
player picks it, and the room becomes decoration. This cannot be fully
checked by a machine, but the cheapest tell can be, and the validator
rejects a lopsided pair — one label much longer than the other reads as
the considered option.

The validator also enforces exactly ten rooms numbered without gaps (the
depth is in a CHECK constraint, the reward ladder, and the copy) and that
the hoard holds something distributable (it is the only source of these
items in the game).

### The ten things at the bottom

A mix of food, toys and books rather than ten curios: something you eat
and something you read are gone afterwards, so the hoard can be reached
twice and matter twice. None of them make the game easier — the coins that
buy everything else are earned by playing, and a rare item that changed
that would be pay-to-win with a longer walk. They are tradeable, which is
the only route by which anyone unlucky at doors will ever see one.

## ADR-60: Three ways to look after a companion

**Status.** Accepted.

**Context.** Feeding, playing and reading were the whole of pet care, and
all three are the same shape: spend an item, watch a meter go up. The ask
was for depth — illnesses and the shop that answers them, plus two more
mechanics. What went in: **ailments** with remedies, a **coat** with
grooming tools that are kept rather than consumed, and a **bond** that only
ever grows.

### An illness that cannot punish absence

This is the feature most likely to break the rule the whole game is built
on — pets cannot die, and missing a day must not permanently disadvantage
anyone. Three properties make an ailment safe, and each is *enforced*
rather than intended:

1. **At most one per companion per game day**, by `@@unique([petId,
   gameDate])`. A fortnight away cannot stack fourteen ailments. It
   produces at most the one running when you get back, and usually not
   even that.
2. **Every ailment ends untreated**, within three days at the outside.
   `restHours` is bounded by the content schema *and* by a CHECK
   constraint, so absence is self-healing by construction rather than by
   a cleanup job.
3. **Nothing is taken and no stat is pushed down.** An ailment CAPS health
   and adds a little to happiness decay; it never drains. The decay floors
   underneath everything (ADR-52) are untouched, so an ailment cannot
   reach past ordinary neglect.

A remedy therefore buys *time*, never rescue. Doing nothing is always a
legitimate answer, and the card on the home page says so in as many words
— the comfort line is a required field on every ailment kind, not a nicety
an author may skip.

**The roll cannot be re-rolled.** Onset is an HMAC over (pet, game date)
keyed by `DAILY_ROTATION_SECRET`, the same key the rotation bands use
(ADR-44). Refreshing a hundred times asks the same question and gets the
same answer. An unkeyed digest of two public values would let anybody
compute tomorrow; a random draw per page view would make "is my companion
ill" a slot machine you pull with F5.

Likelihood is 2%–15% a day, centred on 9%: a poor coat adds up to 6
points, a long-standing bond takes off up to 4, and a long bond also
shortens the wait by up to a quarter. Ailments are drawn lazily on read,
like the lantern's hunt — an ailment nobody looked at may as well not have
happened, and there is no cron to get wrong.

### Grooming is priced like a toy, not like a meal

**A brush is kept, never used up.** The limiter is a four-hour cooldown per
(companion, tool), so the answer to an untidy coat is owning two or three
different tools rather than buying a consumable every week. A player who
buys a brush and a comb in their first fortnight has finished shopping for
grooming, permanently.

That is a deliberate economic choice and not a generosity: the coat feeds
into how likely a companion is to pick something up. If keeping a coat cost
money per session, an ailment would be a recurring bill, and a bill you can
pay to avoid is the manufactured need CLAUDE.md's no-pay-to-win rule exists
to rule out. Grooming had to be a *purchase*, not a *subscription*.

### The bond is a record, and it never goes down

Every act of care adds to it — a meal 1, a toy 2, a brushing 2, a book 4, a
remedy 5 — and nothing ever subtracts. It does not decay with time, which
makes it the only pet number in the game that a week away cannot touch. It
is shown as words and never as a figure or a percentage: a number invites
grinding it, and this is meant to be a description of a history rather than
a target. The five bands are `Newly met` → `Inseparable`.

The remedy paying most is not an accident. The moment a player wants to
have been the kind of player who was there is the moment their companion
is unwell.

### Every refusal is free

Four of them, and all four consume nothing:

* the wrong remedy for this ailment,
* any remedy when nothing is the matter,
* the same brush twice inside its cooldown,
* any brush on a coat already immaculate.

Each says which case it is, and each says that nothing was used. A refusal
that silently ate the item would make experimenting with a system that
deliberately does not publish its answers expensive — and the shed's own
notice board tells the player the honest thing: *most things pass, these
are for when you would rather they passed sooner.*

`COAT_IMMACULATE` is a refusal rather than a no-op for the same reason
`PET_FULL` is: a tap that visibly does nothing reads as a bug.

### A content column that never reached the database

Found in a browser playthrough, and worth recording because nothing in the
stack could have caught it. `coatCare` was added to the content schema, to
`prisma/schema.prisma`, and to the grooming domain — but not to the
seeder's scalar projection. Types passed, the content validator passed, the
seed reported success, and every brush in the game silently became "that
isn't something to groom with", because the column was NULL and an optional
column has a legal NULL.

The fix is not the one line. `itemScalars` is now an exported function held
against `itemSchema.shape` by a test, with an explicit allow-list of the
keys that are relations rather than columns. A gameplay field added to
content and forgotten in the seeder now fails a test instead of shipping as
a feature that quietly does nothing.

### Where it lives

Domain: `modules/pets/{ailments,treat-pet,groom-pet,bond}.ts`. Content:
`prisma/content/pets/ailments.ts` and `prisma/content/items/care.ts`. The
shop is The Physic Shed at Beechrow Physic Garden in Dapplewood, an
ordinary `SHOP` attachment — nothing about medicine needed a new activity
type. The validator enforces that every active ailment is answerable:
either a remedy naming it, or a broad tonic that answers anything.
