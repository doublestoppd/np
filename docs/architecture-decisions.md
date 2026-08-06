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

## ADR-2: Database CHECK constraints via raw SQL in migrations

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

## ADR-4: Showcase entries are ordered references with read-time filtering

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
only published content through `src/server/services/world.ts`. A location is
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
and reports "restocking" instead of queueing page loads behind a lock.
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
from the ledger and checks ten invariants, read-only — repairs happen
only through ledgered admin operations. Fault-injection tests
(`src/server/rollback.test.ts`) prove mid-transaction failures leave no
partial state.

**Why.** The Phase 2 `services/` tree mixed reads, writes, and policy;
the seams chosen here are the ones that carry the invariants. A wrong
`DbTx`/`DbClient` usage is now a compile error rather than a nested
transaction at runtime.
