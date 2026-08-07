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

## ADR-22: Three concrete daily activities, one narrow game-day service

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
