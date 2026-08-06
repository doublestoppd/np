# Glimmergrove

An original, mobile-first browser virtual-pet game. Adopt a grove companion,
keep it fed and happy, and explore together. Built with Next.js (App Router),
TypeScript strict mode, Tailwind CSS, PostgreSQL, Prisma, Zod, and Vitest.

All artwork is original placeholder SVG until final art is ready.

The product vision, design pillars, tone, and player-respect rules that guide
all feature work live in [docs/design-philosophy.md](./docs/design-philosophy.md),
alongside the [art direction](./docs/art-direction.md),
[content model](./docs/content-model.md),
[profile and showcase rules](./docs/profile-and-showcases.md), and
[architecture decision records](./docs/architecture-decisions.md).

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
- Data-driven world content: seeded region and locations power the Explore
  screen and `/explore/<location>` pages; unpublished content stays hidden
- A token-driven design system (`src/app/globals.css` + `src/components/ui`)
  with semantic colors, storybook display type, and reduced-motion support
- Seed data: 3 species, 3 item categories, 6 tags, 11 items (5 foods, 3 toys,
  3 curios), one shop (The Mossy Market) with listings, and the Dapplewood
  region with 4 locations (one unpublished)
- Responsive authenticated shell: bottom navigation on mobile (360 px first),
  sidebar from the `md` breakpoint up

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

## Database migration and seeding

Apply migrations to the development database (also creates the initial
migration state on a fresh database):

```sh
npm run db:migrate
```

Seed species, items, and the shop (idempotent — safe to re-run):

```sh
npm run db:seed
```

For production-style environments use `npm run db:deploy` instead of
`db:migrate`.

## Development

```sh
npm run dev
```

Then open http://localhost:3000, create an account, and choose a starter
companion. New accounts receive a small starter pack of food and a toy.

## Testing

Unit tests for stat decay run with no database. The feed-pet integration
tests (economy/inventory operations, including a concurrency check) need a
PostgreSQL database with migrations applied; they use `TEST_DATABASE_URL`
(falling back to `DATABASE_URL`) and are skipped when neither is set. Use a
dedicated test database — the tests write and delete rows.

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
npm run test:e2e
```

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
                      profile/showcase rules, architecture decisions
prisma/               schema, migrations, seed script
e2e/                  Playwright browser-flow tests
src/app/              App Router routes
  (auth)/             sign-in and sign-up
  (onboarding)/       starter-pet selection
  (game)/             authenticated shell: home, explore (+ locations),
                      games, inventory, profile (+ editor)
  (public)/           public pages: /u/[username]
src/components/
  ui/                 design-system primitives (buttons, surfaces, cards,
                      fields, badges, artwork frames, skeletons…)
  art/                placeholder item and location artwork
  pet/                pet artwork and stat meters
  nav/                responsive game navigation
src/server/           server-only code
  actions/            thin server actions (validation + redirects)
  auth/               password hashing and cookie sessions
  services/           business rules (stat decay, feeding, starter grant,
                      inventory queries, profile, showcase, world content)
src/lib/              Zod schemas and shared helpers
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

- The shop, minigame, quests, daily rewards, and toy play are modeled in the
  database and seed data but have no UI or actions yet.
- Energy currently only declines; rest/play mechanics will restore it in a
  later slice.
- Locations are presentational; discovery gameplay arrives in a later phase.
- No route-level loading skeleton in the game shell (see
  docs/architecture-decisions.md ADR-8); action pending states come from the
  submit buttons.
- Placeholder SVG artwork throughout.
