# Glimmergrove

An original, mobile-first browser virtual-pet game. Adopt a grove companion,
keep it fed and happy, and explore together. Built with Next.js (App Router),
TypeScript strict mode, Tailwind CSS, PostgreSQL, Prisma, Zod, and Vitest.

All artwork is original placeholder SVG until final art is ready.

The product vision, design pillars, tone, and player-respect rules that guide
all feature work live in [docs/design-philosophy.md](./docs/design-philosophy.md),
alongside the [art direction](./docs/art-direction.md),
[content model](./docs/content-model.md),
[profile and showcase rules](./docs/profile-and-showcases.md),
[architecture decision records](./docs/architecture-decisions.md),
[engineering conventions](./docs/conventions.md), and the
[operations runbook](./docs/operations.md).

## Features

- Account creation and sign-in (scrypt password hashing, cookie sessions)
- Starter-pet selection across three original species: Cindertail, Thornbud,
  and Mistfin
- Pet home page with placeholder artwork, name, species, level, and hunger /
  happiness / energy / health meters
- Timestamp-based stat decay computed on the server (pets can never die, and
  missing a day is always recoverable)
- Inventory with search, category filtering, and sorting; data-driven item
  categories and descriptive tags (no enum migration per new item kind)
- Atomic server-side feeding: ownership, food-type, and quantity checks, a
  guarded inventory decrement, hunger restore, and a transaction ledger entry
  in a single database transaction
- Public player profiles at `/u/<username>` (no sign-in required) with title,
  bio, featured companion, coins, and up to six player-chosen "On display"
  showcase slots; a mobile-first authenticated editor at `/profile/edit`
- Page-based world navigation: World Map → Region Map → Location
  (`/explore/<region>/<location>`), with direct Back to Map links,
  illustrated region maps with positioned markers on larger screens, and
  unpublished content hidden everywhere
- A complete server-authoritative item economy: generalized item definitions
  (rarity, stackability, tradeability, provenance policies), hybrid
  ownership (stackable inventory + per-copy item instances), an append-only
  ledger, and idempotency keys on every economic mutation
- Location-based NPC shops with globally limited stock, fixed
  server-derived prices, and deterministic weighted restocking on hidden
  per-shop schedules (cron endpoint + lazy fallback, atomic full
  replacement)
- Persistent per-player fixed-price shops with listing escrow, claimable
  till proceeds, content-configured capacity upgrades, and public
  storefronts; no fees, taxes, or auctions
- Daily activities on one shared UTC game day (reset at 00:00 UTC, no
  streak penalties, nothing purchasable): a three-difficulty daily word
  challenge (ordered 100-word rotations per difficulty with wraparound,
  server-secret answers, any exact-length A-Z guess accepted, exhaustive
  duplicate-letter evaluation), a weighted daily prize wheel whose
  outcome is committed server-side before the animation, and a guaranteed
  daily common-food claim — all idempotent, concurrency-safe, ledgered,
  and replay-safe, with a home-page status panel, three world locations,
  and a composed daily history page
- Locations composed from ordered activity attachments: a typed,
  compile-time-exhaustive registry renders NPC shops, the three dailies,
  and request boards, isolating one broken activity instead of blanking
  the page — the location route contains no feature-specific branching
  (docs/architecture-decisions.md ADR-25)
- Request boards: an ordered, authored list of item-delivery requests per
  board, each player progressing independently with wraparound, a
  configurable UTC daily completion cap that defers rather than removes
  work, atomic consume-and-reward with idempotent replay and optimistic
  concurrency, and immutable completion history with a requirements
  snapshot
- Item detail pages, market search with filters and cursor pagination, and
  a full commerce history ledger view
- Anti-abuse controls: database-backed rate limits, security event audit
  log, suspicious-activity escalation hooks, and an operator CLI
  (docs/operations.md)
- Production hardening: bigint money end to end, an item lifecycle
  (draft/active/retired/disabled) instead of deletion, append-only
  instance provenance linked to the ledger, normalized account identity,
  soft account deactivation that returns escrow and pays out proceeds,
  fail-closed production configuration validation, health/readiness
  endpoints, structured JSON logging, and a read-only economy
  reconciliation tool (`npx tsx scripts/reconcile.ts`)
- A token-driven design system (`src/app/globals.css` + `src/components/ui`)
  with semantic colors, storybook display type, motion/elevation/layout
  tokens (including safe-area-aware bottom-navigation clearance), reduced
  -motion support, and a documented primitive set — page headers with
  quiet back links, a shared player-status vocabulary, one item identity
  block for every commerce surface, a single bigint currency renderer,
  persistent inline notices, and artwork frames with focal-point and
  placeholder handling (docs/conventions.md — Player-facing UI, ADR-24)
- The coin balance lives in the app shell (sidebar and mobile utility
  bar), so it is visible on every purchase surface
- TypeScript content authoring (`prisma/content/`, offline-validated):
  3 species, 3 item categories, 6 tags, 45 items across four rarities
  (including instanced, provenance-bearing, nontradeable, and
  date-limited examples), the Dapplewood region with 8 locations, two
  NPC shops, 4 shop-capacity upgrade tiers, a versioned prize-wheel
  configuration with two item pools, a weighted daily food pool, 300
  content-reviewed daily word answers (100 ordered per difficulty), and a
  12-request kitchen board — with offline validation of activity
  attachments and a per-request economy balance report
- Responsive authenticated shell: bottom navigation on mobile (360 px first),
  sidebar from the `lg` breakpoint up, shared by authenticated and public
  pages so a signed-in player never loses navigation mid-purchase

## Requirements

- Node.js 20+
- PostgreSQL 14+ running locally (or a connection string to one)

## Local setup

1. Install dependencies (this also runs `prisma generate`):

   ```sh
   npm install
   ```

2. Create the databases and role (adjust to taste):

   ```sh
   psql -U postgres -c "CREATE ROLE vpet LOGIN PASSWORD 'vpet' CREATEDB;"
   createdb -U postgres -O vpet virtualpet
   createdb -U postgres -O vpet virtualpet_test
   ```

3. Configure the environment:

   ```sh
   cp .env.example .env
   # then edit DATABASE_URL / TEST_DATABASE_URL if your setup differs
   ```

## Content, migrations, and seeding

Game content (species, items, world, shops, daily activities, word
rotations) is plain TypeScript under `prisma/content/` — see
[prisma/content/README.md](./prisma/content/README.md) for the authoring
guide. The everyday commands:

```sh
npm run content:validate  # offline content validation (no database)
npm run db:fresh          # drop + migrate + validate + seed, one command
npm run db:reset          # drop + migrate only
npm run db:seed           # validate content, then synchronize it
```

Reset commands are guarded: they refuse `NODE_ENV=production` and
non-local databases (unless `DATABASE_DISPOSABLE=true`). The project is
in private pre-alpha — the development database is disposable and is
fully reset after major schema work (see CLAUDE.md). For incremental
schema work use `npm run db:migrate`; production-style environments use
`npm run db:deploy`.

## Development

```sh
npm run dev
```

Then open http://localhost:3000, create an account, and choose a starter
companion. New accounts receive a small starter pack of food and a toy.

Two additional environment variables power commerce and the daily
activities (see [docs/operations.md](./docs/operations.md)):
`RESTOCK_SEED_SECRET` (deterministic NPC restocks) and `CRON_SECRET`
(bearer token for the `POST /api/internal/restock` scheduler endpoint,
which also pre-generates daily word puzzles). Both are required in
production. Shops restock and puzzles generate lazily on demand too, so
local development works without any cron. Operator commands:
`npx tsx scripts/admin-cli.ts`.

## Testing

Pure unit tests (stat decay, money, validation, restock planning) run with
no database. The integration suites — economy, inventory, commerce,
restocking, showcases, authorization, account deactivation, reconciliation,
plus real concurrency races and fault-injection rollback tests — need a
PostgreSQL database with migrations applied; they use `TEST_DATABASE_URL`
(falling back to `DATABASE_URL`) and skip visibly when neither is set
locally. In CI a missing database is a hard failure, so the pipeline can
never pass by silently skipping them (see `.github/workflows/ci.yml`).
Use a dedicated test database — the tests write and delete rows.

```sh
# one-time: apply the schema to the test database
DATABASE_URL="postgresql://vpet:vpet@localhost:5432/virtualpet_test" npx prisma migrate deploy

npm run test        # run once
npm run test:watch  # watch mode
```

Browser-flow tests (Playwright, 360 px mobile viewport) run against a
production build and the development database (they create uniquely named
throwaway accounts):

```sh
npx playwright install chromium   # one-time, unless a preinstalled browser exists
npm run build
RESTOCK_SEED_SECRET=local-e2e-secret CRON_SECRET=local-e2e-cron \
  APP_URL=http://127.0.0.1:3100 TRUSTED_PROXY=false npm run test:e2e
```

The extra variables are needed because the e2e server runs in production
mode, and production startup refuses development fallback secrets
(docs/operations.md — startup validation).

## Other commands

```sh
npm run typecheck   # TypeScript, strict mode, no emit
npm run lint        # ESLint (next/core-web-vitals + next/typescript)
npm run build       # production build
npm run start       # serve the production build
npm run db:studio   # browse the database with Prisma Studio
```

## Demo hosting

To run a public demo on a DigitalOcean droplet (e.g. https://anrpg.com), see
[demo-hosting.md](./demo-hosting.md). It documents `scripts/demo/setup-droplet.sh`
(one-shot droplet setup) and `scripts/demo/redeploy.sh` (wipe everything,
re-clone, rebuild, restart — installed as `glimmergrove-redeploy`).

## Project structure

```
docs/                 design philosophy, art direction, content model,
                      profile/showcase rules, architecture decisions,
                      engineering conventions, operations runbook
.github/workflows/    CI: migrations + drift check, typecheck, lint,
                      tests (database required), build, e2e, reconcile
prisma/
  content/            game content as TypeScript data, by domain
                      (species, items, world, shops, daily, requests)
                      + Zod schemas
  seed/               offline validation + per-domain synchronization
                      with explicit policies and a change report
  schema.prisma, migrations/, seed.ts (orchestrator)
e2e/                  Playwright browser-flow tests
scripts/              demo hosting scripts, operator admin CLI
src/app/              App Router routes
  (auth)/             sign-in and sign-up
  (onboarding)/       starter-pet selection
  (game)/             authenticated shell: home, explore (world → region →
                      location + NPC shops), games, inventory, items,
                      market, shop dashboard, history, profile (+ editor)
  (public)/           public pages: /u/[username], /shops/[slug]
  api/internal/       authenticated restock scheduler endpoint
src/components/
  ui/                 design-system primitives (buttons, surfaces, cards,
                      fields, badges, artwork frames, skeletons…)
  location-activities/ typed activity registry + one renderer per
                      activity type (the UI composition layer)
  requests/           request board player interface
  art/                placeholder item and location artwork
  pet/                pet artwork and stat meters
  nav/                responsive game navigation
src/server/           server-only code
  actions/            thin server actions (validation + redirects)
  auth/               password hashing and cookie sessions
  modules/            domain logic by capability, commands split from
                      queries (docs/conventions.md):
                      accounts/ (identity, deactivation), pets/ (decay,
                      feeding, starter), items/ (lifecycle, ownership,
                      provenance), profiles/, world/, commerce/ (wallet,
                      ledger, NPC shops, restocking, player shops,
                      search, history), daily/ (game day, word
                      challenge, prize wheel, community meal), admin/
                      (operations, reconciliation)
  security/           rate limits, idempotency, audit log, request
                      context, startup configuration validation
src/lib/              Zod schemas, money boundary, shared helpers
test/                 shared factories and helpers for integration tests
```

Design rules the code follows: server components by default; the client never
supplies trusted values for currency, items, or stats; economy and inventory
mutations happen in database transactions in service modules; all external
input is validated with Zod.

### Dependency notes

Beyond the core stack, dev-only helpers: `tsx` (runs the TypeScript seed
script), `dotenv` (loads `.env` for Vitest), and `@playwright/test`
(browser-flow tests; named in CLAUDE.md's stack).

## Current limitations

- Quests and toy play are not implemented yet.
- Energy currently only declines; rest/play mechanics will restore it in a
  later slice.
- Two non-shop locations are presentational; the rest host activities
  (the three dailies and the first request board). Open-world discovery
  gameplay arrives in a later phase.
- Content authoring (regions, locations, activity attachments, items,
  pools, schedules, request boards) is TypeScript data under
  `prisma/content/`; the operator CLI covers runtime toggles
  (docs/operations.md).
- No route-level loading skeleton in the game shell (see
  docs/architecture-decisions.md ADR-8); action pending states come from the
  submit buttons.
- Placeholder SVG artwork throughout.
