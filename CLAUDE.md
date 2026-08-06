Project: Mobile-First Virtual Pet Game

Product

This is an original browser-based virtual pet game inspired by the general virtual-pet, collecting, exploration, and minigame genre.

Do not copy protected names, artwork, characters, species, locations, stories, layouts, or terminology from Neopets or another existing game.

The game must be designed mobile-first and remain fully usable at a viewport width of 360 pixels.

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

* Use server components by default.
* Use client components only where browser state or interaction requires them.
* Never trust currency, rewards, item quantities, pet statistics, or minigame scores submitted by the client.
* Perform economy and inventory changes on the server.
* Use database transactions for purchases, rewards, trades, and inventory mutations.
* Validate all external input with Zod.
* Keep business rules in service modules, not React components or route handlers.
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
