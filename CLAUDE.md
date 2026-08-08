Project: Mobile-First Virtual Pet Game

Product

This is an original browser-based virtual pet game inspired by the general virtual-pet, collecting, exploration, and minigame genre.

Do not copy protected names, artwork, characters, species, locations, stories, layouts, or terminology from Neopets or another existing game.

The game must be designed mobile-first and remain fully usable at a viewport width of 360 pixels.

Design Documentation

Before implementing any substantial feature, read the relevant documents in docs/:

* docs/design-philosophy.md — authoritative product direction, tone, player-respect rules, and the guiding question for any proposed feature.
* docs/art-direction.md — visual principles: hand-painted fantasy storybook target (not pixel art), restrained modern UI, replaceable design tokens, art asset roles and naming, placeholder policy.
* docs/content-model.md — how items, categories, tags, regions, locations, and future content are represented and extended.
* docs/profile-and-showcases.md — public profile, player-chosen showcases, and the prohibition on developer-defined collections.
* docs/architecture-decisions.md — consequential schema/architecture decisions; add an entry when making one.
* docs/conventions.md — binding engineering conventions: repository layout and dependency direction, command/query split, transaction ownership, money (bigint) rules, item lifecycle and ownership boundaries, identity normalization, migrations, error/logging contracts, and testing/CI requirements.
* docs/operations.md — operator runbook: environment variables, health checks, backups/restore, reconciliation, restock scheduling, admin CLI, anti-abuse controls, incident playbook.

Non-negotiable rules encoded there: pets cannot die; no punitive inactivity; no energy gates on play; no pay-to-win, **real-money** loot boxes, mandatory PvP, or fear-of-missing-out mechanics (the loot-box rule is about monetized randomness — a coin-priced game of chance bought with currency earned by playing is not what it prohibits); a collection is whatever the player decides it is — no official collection checklists, completion percentages, or collection rewards; categories and tags describe content, never prescribe collecting; the defining world concept is undecided, so placeholder names and copy must stay replaceable; visual target is hand-painted storybook fantasy with a restrained modern interface, never pixel art.

## Pre-Alpha Database and Compatibility Policy

The project is currently in private pre-alpha. There are no production users and no persistent development data that must be preserved. After significant schema or feature changes, the database may be deleted, recreated, and fully reseeded.

During pre-alpha:

* Prefer the cleanest long-term schema over backward compatibility.
* Do not preserve obsolete tables, columns, APIs, adapters, or code paths.
* Do not write data migrations solely to protect disposable test data.
* Rename, split, merge, normalize, or remove models when it improves the design.
* Replace flawed implementations directly instead of layering compatibility code over them.
* Delete obsolete migrations and squash the development migration history when appropriate.
* Keep seed data deterministic enough for testing and manual playtesting.
* Assume playtest accounts, inventories, shops, puzzles, and history may be erased.

Disposable during pre-alpha: database IDs, table and column names, development accounts, playtest inventories and history, the migration sequence. Relatively stable: content slugs, public route slugs, item and location reference keys, configuration version identifiers once referenced by immutable history, and deliberately finalized user-visible names. Content slugs may still be renamed when creatively necessary — update every reference, route, seed entry, and test in the same change.

This policy changes only when the project begins preserving external tester data or otherwise enters a migration-sensitive stage.

## World Model: Regions, Locations, Activities

The world is `World Map -> Region -> Location -> zero or more ordered
activity attachments`.

* A location is a normal page: artwork, title, region context, flavor text.
* A location may host several activities, or none (a flavor/exploration page).
* An attachment says WHAT is available here (`type` + stable `activityKey`)
  and in what order. It never stores rules, scripts, or generic JSON config.
* The activity's rules, state, commands, queries, and view models live in
  its own domain module. The world domain owns locations and attachments
  and imports no activity domain.
* Static illustrated people and prose are location presentation content.
  There is no NPC entity, dialogue, schedule, friendship, movement, or
  character-simulation system, and none should be added.

**Three of these are canvas action games** (ADR-62, ADR-63). They share a harness —
`lib/games/arcade/` for the pure physics and trace codec,
`modules/games/arcade/` for the run lifecycle and anti-cheat,
`components/games/arcade/` for the loop and canvas — so a third one is a
physics file plus a draw function, not another copy of the whole stack. The
rule that makes them safe: **the client submits its inputs, never a score**,
and the server replays them.

There is no run-rules versioning anywhere, deliberately: the database is
reset on every change, so a run in flight across a deploy is not a thing
that happens (ADR-63).

**Adding a new activity type** (e.g. fishing) — no central slug switch,
no generic engine:

1. Add the value to `LocationActivityType` in prisma/schema.prisma.
2. Build the domain module under `src/server/modules/<activity>/` with its
   own rules, commands, queries, and errors.
3. Add a renderer in `src/components/location-activities/` and register it
   in `registry.tsx`. The registry is exhaustive at compile time, so a
   missing renderer is a type error (and a test failure).
4. Add validation for its attachment keys in `prisma/seed/validation.ts`.

The registry in step 3 is the only one of these the compiler enforces on
its own; adding a type also breaks `describeActivity` in
`modules/directory`, the map badge labels, and the directory list's icon
and tint maps, all of which are `Record<LocationActivityType, …>` and so
fail to compile until filled in. Two things are NOT compile-checked and
have to be remembered: `DIRECTORY_TYPES` (whether the activity appears on
the Activities tab at all) and the seed validator's switch.

**Attaching an existing activity to a location** is content-only: add an
entry to that location's `activities` array in `prisma/content/world/`
with the type, the activity's key, and a display order, then reseed.

**An activity available at every location** is not an attachment. Attaching
it everywhere means remembering to do so for every location ever added, and
missing one silently breaks it. Render it from the location page shell
instead, below the attachments, and attach only its notice board if it has
one (the lantern hunt does this — ADR-45).

## Content Authoring

Game content (species, items, world, shops, daily activities, word rotations) lives in plain TypeScript files under prisma/content/, organized by domain and validated offline. See prisma/content/README.md for the authoring guide. The workflow: edit a content file, `npm run content:validate`, `npm run db:fresh` (guarded full reset + reseed). Never put Prisma writes in content files or content arrays in the seed orchestrator.

Technical Stack

* Next.js with the App Router
* React
* TypeScript with strict mode enabled
* Tailwind CSS
* PostgreSQL
* Prisma ORM
* Zod validation
* Vitest for unit and integration tests
* Playwright for critical browser flows

Engineering Rules

The authoritative, detailed rules live in docs/conventions.md (layout, dependency direction, commands vs queries, transaction ownership, money handling, lifecycle/provenance, identity, migrations, errors, logging, testing). The essentials:

* Use server components by default.
* Use client components only where browser state or interaction requires them.
* Never trust currency, rewards, item quantities, pet statistics, or minigame scores submitted by the client.
* Perform economy and inventory changes on the server.
* Use database transactions for purchases, rewards, trades, and inventory mutations.
* Validate all external input with Zod.
* Keep business rules in domain modules (src/server/modules), not React components, server actions, or route handlers.
* Coin amounts are bigint end to end; convert only through src/lib/money.ts.
* Avoid any.
* Add tests for economy and inventory operations.
* Prefer small, focused files and functions.
* Do not introduce a new dependency without explaining why it is needed.
* Preserve accessibility, keyboard navigation, focus states, and sufficient contrast.
* Use semantic HTML.
* Do not expose secrets or privileged database credentials to client bundles.

Product Rules

* Pets cannot die.
* Pet needs decline gradually and are calculated from timestamps.
* Missing a day must not permanently disadvantage a player.
* Daily rewards must be based on server time.
* All rewards must be idempotent and resistant to duplicate requests.
* The initial release contains three starter species, one shop, one minigame, basic quests, inventory management, and pet care.
* Personal records (longest catch, best score) are private. The game never ranks one player against another.
* Use placeholder SVG artwork until final original art is available.

Workflow

Before implementing a substantial feature:

1. Inspect the existing repository.
2. Describe the proposed implementation briefly.
3. Identify affected database models and routes.
4. Implement the smallest complete vertical slice.
5. Run type checking, linting, and relevant tests.
6. Report changed files, test results, and unresolved issues.

Do not silently rewrite unrelated code.
