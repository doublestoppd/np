# Glimmergrove

An original, mobile-first browser virtual-pet game. Adopt a grove companion,
keep it fed and happy, and explore together. Built with Next.js (App Router),
TypeScript strict mode, Tailwind CSS, PostgreSQL, Prisma, Zod, and Vitest.

All artwork is original placeholder SVG until final art is ready.

## Features in this slice

- Account creation and sign-in (scrypt password hashing, cookie sessions)
- Starter-pet selection across three original species: Cindertail, Thornbud,
  and Mistfin
- Pet home page with placeholder artwork, name, species, level, and hunger /
  happiness / energy / health meters
- Timestamp-based stat decay computed on the server (pets can never die, and
  missing a day is always recoverable)
- Inventory page with food and toys
- Atomic server-side feeding: ownership, food-type, and quantity checks, a
  guarded inventory decrement, hunger restore, and a transaction ledger entry
  in a single database transaction
- Seed data: 3 species, 5 foods, 3 toys, and one shop (The Mossy Market) with
  listings
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

## Other commands

```sh
npm run typecheck   # TypeScript, strict mode, no emit
npm run lint        # ESLint (next/core-web-vitals + next/typescript)
npm run build       # production build
npm run start       # serve the production build
npm run db:studio   # browse the database with Prisma Studio
```

## Project structure

```
prisma/               schema, migrations, seed script
src/app/              App Router routes
  (auth)/             sign-in and sign-up
  (onboarding)/       starter-pet selection
  (game)/             authenticated shell: home, explore, games,
                      inventory, profile
src/components/       shared UI (nav, pet art, stat meters)
src/server/           server-only code
  actions/            thin server actions (validation + redirects)
  auth/               password hashing and cookie sessions
  services/           business rules (stat decay, feeding, starter grant)
src/lib/              Zod schemas
```

Design rules the code follows: server components by default; the client never
supplies trusted values for currency, items, or stats; economy and inventory
mutations happen in database transactions in service modules; all external
input is validated with Zod.

### Dependency notes

Beyond the core stack, two dev-only helpers are included: `tsx` (runs the
TypeScript seed script) and `dotenv` (loads `.env` for Vitest).

## Current limitations

- The shop, minigame, quests, daily rewards, and toy play are modeled in the
  database and seed data but have no UI or actions yet.
- Energy currently only declines; rest/play mechanics will restore it in a
  later slice.
- Playwright browser tests are not set up yet; server logic is covered by
  Vitest unit and integration tests.
- Placeholder SVG artwork throughout.
