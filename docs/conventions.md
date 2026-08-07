# Engineering Conventions

Binding conventions for this codebase. CLAUDE.md points here; when a rule
in this file and ad-hoc habit disagree, this file wins. Consequential
one-time decisions live in `docs/architecture-decisions.md`; this document
records the standing rules those decisions produced.

## Repository layout and dependency direction

```
src/app/            Routes and pages (server components by default)
src/components/     Shared UI primitives and client components
src/server/actions/ Server actions: parse input, resolve session, call modules
src/server/modules/ Domain logic, grouped by capability:
                    accounts/ admin/ commerce/ daily/ events/ items/
                    pets/ profiles/ requests/ world/
src/server/security/ Cross-cutting protections (rate limits, idempotency,
                    audit, request context, configuration validation)
src/server/auth/    Password hashing and session management
src/lib/            Pure shared code, importable anywhere (money, validation)
test/               Factories and helpers shared by integration tests
```

Dependencies point downward only: `app → actions → modules → (security,
auth, lib, db)`. Modules never import from `actions/` or `app/`; nothing
under `server/` is imported by client components. Route handlers and
server actions contain no business rules — they parse input with Zod,
resolve the session, call a module function, and translate errors.

## Commands and queries

Inside a module, state-changing operations live in `commands/` (or a
clearly command-shaped file such as `purchase.ts`) and read paths live in
`queries.ts`. Commands own their transaction; queries never mutate.
Public reads must use the same eligibility predicates as purchases
(`commerce/policies.ts`) so a listing that cannot be bought is never shown.
`/market` is a marketplace, not a catalogue index: it lists only items
with a purchasable listing right now. An item nobody is selling is an
offer the page cannot honour, so it does not appear at all.
`generateMetadata` is a public read: it must apply the page's own
visibility predicate, or the document title announces content the page
refuses to render. Share the lookup with `cache()` rather than querying
twice — every route with a `generateMetadata` does this.

An activity's status on a directory (the home dashboard, `/games`) is a
public read too, and comes from the same query the activity's own page
renders from — via `modules/directory`, which is the composition layer
allowed to import world plus every activity domain. A card must never say
"Available" about a page that says it is closed, and must never carry
another activity's name or state.

## Transaction ownership

- Top-level commands accept `DbClient` and begin the transaction.
- Helpers (wallet debits/credits, ledger writes, item grants, escrow,
  provenance) accept `DbTx` and never begin their own transaction — the
  types in `src/server/db.ts` make misuse a compile error.
- Every economic mutation and its ledger row commit atomically or not at
  all. The fault-injection suite (`src/server/rollback.test.ts`) proves
  mid-transaction failures leave no partial state.
- Concurrency is handled with row-level guards (guarded `updateMany` with
  the expected precondition in the `where`) and unique constraints.
  Postgres transaction advisory locks are the fallback for invariants
  that span rows with no single row to guard — restocking, player-shop
  upgrades and listings, and showcase reordering. Never rely on
  serializable isolation or in-process locks.
- A read that feeds a write must happen inside the writing transaction.
  Reading a row before the transaction opens and writing it back
  afterwards is a lost update even when every individual statement is
  correct: `grantItem` re-reads item lifecycle inside the transaction,
  daily rewards re-check their configuration there, and feeding re-reads
  pet stats after consuming the food and writes them back guarded on the
  snapshot timestamp.

## Money

- Coin amounts are `BigInt` in the database and `bigint` in application
  code, end to end. Never pass a coin amount through `Number`.
- All conversion happens in `src/lib/money.ts`: `coinsFromInput` (bounded
  player input), `formatCoins` (display), `coinsToJSON`/`coinsFromJSON`
  (decimal strings for JSON payloads and stored idempotency results).
- Client-submitted amounts are advisory at most; prices and totals are
  always recomputed server-side from database rows.

## Item lifecycle and ownership

- `Item.lifecycle`: `DRAFT` (invisible to players), `ACTIVE` (fully
  available), `RETIRED` (owned copies remain visible, usable, tradeable;
  no new distribution), `DISABLED` (kill switch — hidden and inert
  everywhere, ownership records preserved). Policy helpers live in
  `modules/items/lifecycle.ts`; never compare lifecycle strings inline.
- Ownership is hybrid: stackable definitions use `InventoryEntry`
  quantities; non-stackable definitions use one `ItemInstance` row per
  copy. `modules/items/ownership-view.ts` presents both as one
  `OwnedAsset` list — UI code consumes that boundary, not the raw tables.
- Instance history is the append-only `ItemProvenanceEvent` table, linked
  to the ledger row that caused each event. Never store history in
  mutable JSON.

## Economy invariants

- Every coin or item mutation writes a `Transaction` ledger row in the
  same database transaction. For any account,
  `coins − sum(ledger deltas) = starting coins`; `scripts/reconcile.ts`
  verifies this and the other invariants listed in docs/operations.md,
  read-only.
- Ledger-adjacent foreign keys are `Restrict` — nothing may cascade over
  economic history. Deletion of accounts and content is soft
  (deactivation, lifecycle transitions), never row deletion.
- Every economic mutation requires an idempotency key (scoped
  user+operation, fingerprinted, result stored for replay).
- One starter pet per account is enforced by the unique `StarterClaim`
  row inside the adoption transaction — not by checks in page code. The
  claim references the pet, so the pet is written first; the guarantee
  comes from the unique violation rolling that pet back, not from
  ordering.

## Commerce eligibility and account state

- `commerce/policies.ts` is the single source of truth for who may trade
  what: seller commerce bans (`commerceDisabledAt`), deactivated
  accounts, inactive shops, and item lifecycle are enforced there for
  writes and mirrored in every public read predicate.
- Disabled or deactivated sellers can always recover their own property:
  cancelling listings and claiming earned proceeds remain allowed.
- A listing is a stack of things for sale, not a bundle: buyers take part
  of it and the rest stays on offer. `PlayerShopListing.quantity` is what
  REMAINS and `quantityListed` is immutable, so `quantityListed - quantity`
  is always what has been sold — the invariant `scripts/reconcile.ts`
  checks against the PLAYER_SALE ledger rows. The listing carries no
  buyer: a sale is a ledger event, and one listing can have many.
- Account closure is `deactivateAccount`: cancels listings, returns
  escrow, claims the till into the wallet, closes the shop, deletes all
  sessions, sets `deactivatedAt`. Every step is guarded, because closure
  races live buyers: the deactivation is claimed first, each listing is
  cancelled under a `status: "ACTIVE"` guard, and the till is claimed
  under an amount guard *after* the shop closes. History is preserved;
  public reads and authentication exclude deactivated accounts.
- `grantItem` requires a `reason`: `distribution` (new copies entering
  circulation) is refused for items that are not currently distributable;
  `restoration` (escrow returns, operator adjustments) is always allowed,
  because withdrawing an item must never confiscate owned copies.

## Identity

- `normalizedUsername` (NFKC → trim → lowercase, see
  `modules/accounts/identity.ts`) is the unique account identity used for
  sign-in, profile lookup, and default shop slugs. Display `username`
  preserves chosen casing.
- Slugs are stable once public: renames must not change an existing shop
  or profile URL.

## Time

- All timestamps are UTC; scheduling math (restock windows, decay) is
  pure arithmetic on `Date` values, never local-timezone formatting.
- Code that needs "now" in a testable way takes an injectable `now`
  parameter or the `Clock` interface (`src/server/clock.ts`). Restock
  windows are per-shop `(intervalMinutes, anchorAt)` anchors — never
  wall-clock alignment assumptions.

## Migrations and backups

- **Pre-alpha:** the schema and all development data are disposable
  (CLAUDE.md — Pre-Alpha Database and Compatibility Policy). Choose the
  cleanest schema directly, squash noisy migration history to a clean
  baseline, and reset with `npm run db:fresh` instead of writing
  backfills for disposable data. The rules below describe the discipline
  that applies once real player data must survive.
- Any migration needing backfills or constraints Prisma cannot model:
  generate SQL with `prisma migrate diff`, hand-edit, apply with
  `prisma migrate deploy`. Additive column changes follow
  add-nullable → backfill → `SET NOT NULL`.
- Every migration must be safe to run on a populated database and must
  state its recovery notes in comments when it transforms data.
- CI fails when applied migrations and `schema.prisma` drift
  (`prisma migrate diff --exit-code`).
- Backup/restore procedure, retention, and the restore drill are in
  `docs/operations.md`; a migration that cannot be restored from backup
  does not ship.

## Errors and logging

- Domain errors extend `DomainError` (`src/server/errors.ts`): a stable
  machine `code` plus a `publicMessage` safe to show players. Economy
  conflicts state plainly that the player was not charged.
- Raw error objects, stack traces, secrets, IPs, and security thresholds
  never reach the client. Full detail goes to the structured JSON logs
  (`src/server/logging.ts`) with a correlation id.
- Security-relevant events (rate-limit violations, stale-stock attempts,
  high-value purchases, admin actions, deactivations) are recorded via
  `security/audit.ts`, with retention cleanups for old rows.

## Testing and CI

- Economy and inventory logic gets integration tests against real
  Postgres; concurrency claims get real concurrent tests
  (`test/helpers/concurrency.ts`); rollback claims get fault-injection
  tests (`test/helpers/fault-injection.ts`).
- Game content is TypeScript data under `prisma/content/` validated by
  `npm run content:validate` (offline); synchronization policies live in
  `prisma/seed/` and print a per-domain change report. Content files
  contain no Prisma calls; the orchestrator contains no content arrays.
- Suites use `test/factories/*` with a per-suite `fixturePrefix` so
  parallel files never collide, and scope cleanup (including
  `RateLimitWindow` rows) to their own fixtures.
- Integration suites skip visibly without a database locally, but CI
  hard-fails if `CI=true` and no test database is configured — a green
  pipeline can never mean "tests silently skipped".
- `.github/workflows/ci.yml` runs: schema validate, migrate deploy,
  drift check, typecheck, lint, vitest, production build, Playwright at
  360 px, and a final economy reconciliation.

## Player-facing UI

- Design tokens in `src/app/globals.css` (`@theme`) are the source of
  truth for color, type, spacing, shape, elevation, motion, layout, and
  artwork presentation. Routes never hard-code hex values, shadows,
  radii, or the bottom-navigation clearance (`pb-nav-clearance`).
- Pages compose the shared primitives in `src/components/ui` —
  `PageHeader` (with quiet `backHref`), `SectionHeading`, `Surface`,
  `StatusBadge`, `InlineNotice`/`FeedbackBanner`, `EmptyState`,
  `ItemIdentity`, `ContentCard`, `CurrencyAmount`, `TextLink`,
  `IconButton`, `ArtworkFrame`, `FilterBar` — instead of hand-rolling
  headers, item rows, links, empty states, or coin amounts.
- Every coin amount a player sees goes through `src/lib/money.ts` —
  `CurrencyAmount` wherever an amount stands on its own (bigint in,
  grouped digits and explicit +/− deltas out), and `formatCoins` +
  `coinLabel` inside a sentence or a ledger note. Never `coinsToJSON`,
  which is serialization for stored results and logs and renders an
  un-grouped decimal string.
- Pet condition is **never rendered as a number**. The server keeps 0–100
  integers; `src/lib/pet-condition.ts` is the only place they become
  words, and `PetConditionMeter` is the only thing that draws them. That
  includes anything derived from a stat — food is "a hearty meal", not
  "restores 30 hunger" — and anything a server action puts in a notice.
  A number invites optimisation; a state describes an animal.
- Availability/completion states use the shared `StatusBadge` vocabulary
  (AVAILABLE, IN_PROGRESS, COMPLETED, FAILED, CLAIMED, SOLD_OUT,
  UNAVAILABLE) with icon + label — never raw enum names, never color
  alone.
- One visually dominant primary action per page; back navigation is the
  quiet `BackLink` that `PageHeader` renders, not a competing button, and
  it always names its destination. Cards are for interactive or
  conceptual units — titles and flavor text sit directly on the page.
- Item rows on every surface (shops, listings, management, rewards)
  compose `ItemIdentity`: artwork and name first, rarity on its own line
  under the name, metadata and price in consistent slots, and the action
  either as a full-width row beneath the artwork (`below`, for forms with
  their own fields) or beside the price (`inline`, for a single button —
  the artwork already sets the row height, so a lone button costs nothing
  there and a whole band of card height below). Browsing rows carry no
  input fields: committing to a quantity belongs in the dialog that opens
  when the player decides to buy, not on every card they scroll past. Rarity qualifies an item, it
  does not continue its name, and an action packed into the text column
  makes that column taller than the artwork — which is what leaves dead
  space beside the art on a phone.
- Persistent inline notices (never disappearing toasts) carry commerce
  conflicts, daily results, and reward outcomes.

## Navigation, assets, accessibility

- Mobile-first: every screen must be fully usable at 360 px; the bottom
  navigation is the primary wayfinding on mobile, the sidebar on ≥1024 px
  (the `lg:` breakpoint).
- World navigation is page-based (`/explore` → region → location) with
  real URLs — no modal mazes.
- Placeholder SVG art is referenced by `artKey` through the asset helper
  so final art lands by replacing files, not editing screens
  (`docs/art-direction.md`).
- Semantic HTML, visible focus states, labelled controls, and sufficient
  contrast are requirements, not polish; Playwright flows exercise
  keyboard-reachable paths at the mobile viewport.
