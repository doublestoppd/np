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
   day from the documented epoch (`WORD_ROTATION_EPOCH`) and wraps after
   the last ACTIVE answer. Puzzles freeze their answer reference at
   creation. Guesses are validated by shape only: any exact-length A–Z
   sequence consumes an attempt. **Why:** authored order beats opaque
   determinism for a curated daily; a dictionary that rejects honest
   guesses punishes players for the word list's gaps.

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

**Not decided here: the shared answer.** One puzzle per (gameDate,
difficulty) is global, the answer is returned to the client on failure as
well as success, and the rotation is pure date arithmetic over a fixed
list — so today's word can be posted, and after one full rotation the
whole future schedule is public. Making the answer per-player would fix
it at the root and could stay deterministic and secret-free (an index
derived from the game date and the player id, no HMAC, no stored secret),
but it reverses ADR-23's single-global-rotation decision and rewrites the
operator tooling built on it: `puzzle:preview`, `puzzle:regenerate`, and
`puzzle:set-reward` all address "the puzzle for a date", which stops being
a single row. That is a product decision with real trade-offs, not a
defect to quietly fix, so it is recorded here and left open. Lowering the
reward reduces what the exploit is worth by three quarters in the
meantime.

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
home dashboard and `/games` list what there is to do today; the moment
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
