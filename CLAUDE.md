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

Non-negotiable rules encoded there: pets cannot die; no punitive inactivity; no energy gates on play; no pay-to-win, loot boxes, mandatory PvP, or fear-of-missing-out mechanics; a collection is whatever the player decides it is — no official collection checklists, completion percentages, or collection rewards; categories and tags describe content, never prescribe collecting; the defining world concept is undecided, so placeholder names and copy must stay replaceable; visual target is hand-painted storybook fantasy with a restrained modern interface, never pixel art.

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
