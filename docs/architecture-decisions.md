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
