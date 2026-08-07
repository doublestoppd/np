# Operations

Operator procedures for the world/commerce systems. All administrative
paths disable rather than delete, so ledger, restock, listing, sale, and
provenance history always survives.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection (never exposed to clients) |
| `RESTOCK_SEED_SECRET` | HMAC secret for deterministic restock generation. **Required in production**; a dev-only fallback exists so local setups work. Rotating it changes all future restock results (past records keep their stored summaries). The raw secret is never stored in the database — only derived `seedId` identifiers. |
| `CRON_SECRET` | Bearer token for the internal restock endpoint. Without it the endpoint rejects everything. |
| `DAILY_ROTATION_SECRET` | HMAC secret keying every per-band rotation — the daily word's answers (ADR-44) and the lantern's hiding places (ADR-45). **Required in production**; a dev-only fallback exists for local setups and is refused there. A known value makes every band's future answers and hiding places computable, which is the account farm this closed. Safe to rotate at any time: created puzzle and hunt rows keep their frozen reference, so only future draws move. Never printed and never stored — only the resulting references are. |
| `APP_URL` | Canonical public URL. Required in production as a deployment assertion — startup fails without it. Not yet consumed for link generation. |
| `DATABASE_DISPOSABLE` | Set `true` to allow the guarded reset commands (`db:reset`, `db:fresh`) against a non-local database. Never set in production — the guards also refuse `NODE_ENV=production` outright. |
| `TRUSTED_PROXY` | Must be explicitly `"true"` or `"false"` in production. Only when `true` are forwarded client addresses trusted for rate-limit context. Enable it **only** behind a proxy that *overwrites* `X-Real-IP` and `X-Forwarded-For` (the bundled nginx config does); a proxy that appends leaves the client's own value in the header. When `false`, per-origin rate limiting is switched off rather than aimed at everyone — see Anti-abuse controls. |
| `RANDOM_EVENTS_ENABLED` | Optional. Set `"false"` to stop every random-event roll immediately — a kill switch that needs no deploy and leaves history intact. |
| `RANDOM_EVENT_CHANCE_BP` | Optional. Chance an eligible page view produces an event, in basis points of 10000 (default 800 ≈ 1 in 12). Separate from catalog weights on purpose: this tunes frequency, weights tune variety. |
| `RANDOM_EVENT_MIN_INTERVAL_MS` | Optional. Anti-duplicate window between roll attempts (default 3000). Collapses concurrent tabs and retried clients into one attempt; not gameplay pacing. |
| `RANDOM_EVENT_COOLDOWN_MIN_MS` / `RANDOM_EVENT_COOLDOWN_MAX_MS` | Optional. Randomized cooldown after a successful event (defaults 15 and 45 minutes). During a cooldown the probability roll is skipped entirely. |
| `SIGNUP_BURST_LIMIT` | Optional. Account creations allowed across all callers per 5 minutes (default 60). The one deliberately shared limit; raise it for a launch, lower it while under scripted registration. |

**Startup validation.** `src/instrumentation.ts` runs
`assertValidServerConfig()` on boot. In production, a missing variable or
a known development fallback value (`dev-local-restock-seed`, …) crashes
startup with the offending variable names — misconfiguration fails
loudly, never silently. In development the same problems log a warning.

## Health and readiness

- `GET /api/health` — process is up (no dependencies touched).
- `GET /api/ready` — verifies a database round-trip **and** server
  configuration; 503 with a reason when either fails. Point load
  balancers and uptime checks here.

Application logs are single-line JSON (`src/server/logging.ts`) with
level, event, correlation id, and duration for timed operations — ready
for any log collector. No secrets, passwords, or session tokens are ever
logged.

## Backups and restore

The database is the only stateful component; everything else is
rebuildable from the repository.

**Taking a backup** (the demo droplet also takes one automatically every
night and before `glimmergrove-redeploy` wipes the database):

```sh
pg_dump --format=custom --file="backup-$(date -u +%Y%m%dT%H%M%SZ).dump" "$DATABASE_URL"
```

**Retention.** Keep at minimum: 7 daily, 4 weekly, and the last backup
taken before each production migration (kept until the following
migration proves stable). Store copies off the database host.

**Restoring:**

```sh
createdb glimmergrove_restore
pg_restore --no-owner --dbname=glimmergrove_restore backup-<stamp>.dump
# Verify before switching the app over:
DATABASE_URL=postgresql://.../glimmergrove_restore npx tsx scripts/reconcile.ts
```

Then point `DATABASE_URL` at the restored database and restart. Restore
into a fresh database and switch — never `pg_restore --clean` over a
live one while the app is running. (`demo-hosting.md` reaches for
`--clean` only after stopping the service; that is the same rule stated
the other way round.)

**Restore drill.** After any schema-changing release (and at least
monthly), restore the latest backup into a scratch database and run the
reconciliation script against it. A backup that has not been test-restored
is not a backup.

**Migration policy.** Migrations run via `prisma migrate deploy` only
(never `migrate dev` against production), after a backup, from the
repository's committed `prisma/migrations` history. Hand-edited
migrations carry recovery notes in their SQL comments. CI's drift check
guarantees the committed history matches `schema.prisma` exactly.

## Reconciliation

```sh
npx tsx scripts/reconcile.ts [username ...]
```

Read-only; exits 1 when findings exist. Checks: negative balances,
wallet-vs-ledger for every account, instance listings without escrow,
orphaned escrow, sold listings missing their sale units or ledger rows,
listings whose status and remaining stock disagree in either direction
(`sold-listing-with-stock`, `active-listing-without-stock` — public reads
filter on status alone, so nothing else catches a SOLD flip that failed
to land), shop revenue and till totals derived from the ledger rather
than from mutable listing prices, NPC stock vs purchase ledger, stale
idempotency records, starter-claim invariants, invalid showcase
references, and the daily activities (solved word results and wheel/meal
rewards must match their ledger rows exactly; duplicate daily records are
impossible by unique constraint). Run it after
restores, after incidents, and on a schedule (daily is cheap). It never
repairs data — repairs are explicit admin operations, so every fix leaves
an audit trail.

**Alert conditions worth wiring up:** any reconciliation finding;
`/api/ready` failing; a `FAILED` row in `ShopRestock` (`attemptCount`
climbing means the lazy path keeps failing too); a spike in
`SecurityEvent` rows of type `rate-limit-exceeded` or
`stale-stock-attempt`; any
`cron-auth-failure` event; a `cron.puzzle-generation-failed` log line or
`PUZZLE_POOL_EMPTY` errors (today's word puzzles are missing); repeated
`INVALID_WHEEL_CONFIG` errors or `daily-wheel.pool-empty` warnings; an
abnormal prize distribution in the `daily-wheel.spin` logs (group by
`prizeId` per day and compare against the configured weights).

## Fishing and the matching table

- **Fishing pays in fish and never in coins**, so no water can become a
  faucet however it is retuned. Size ranges live on the spot entry, not on
  the item: the same species is meant to run bigger in deeper water.
  Retiring a species deactivates its entries rather than deleting them —
  `FishCatch` and `FishRecord` reference it forever. Watch for
  `fishing.table-empty`, which means every species in a water is inactive
  and the spot is effectively closed.
- **Personal bests are private and must stay that way.** There is no query
  that ranks one player's catches against another's, and adding one would
  reverse a deliberate decision (ADR-47).
- **The matching table pays once per difficulty per game day**, enforced
  by a unique constraint. Playing repeatedly is free to the economy by
  design, so a spike in `matching.flip` volume is not an economic problem —
  check `MatchingPayout` rows, which are what actually cost coins.
- **A voided matching run means a client sent an impossible flip.** It is
  audited as `suspicious-activity` and pays nothing. A handful is
  ordinary (a stale tab); a stream from one account is worth looking at.

## Scratch cards

Three tiers of salt chit, sold at the Raker's Chit Table (ADR-46). What an
operator needs to know:

- **The odds are not published** (ADR-48). Players see the prize ladder
  and the live pool; the weights are operator-only. If a card's ACTIVE
  weights ever fail to total 10000 basis points, scratching that card is
  refused outright and nothing is consumed — watch for
  `scratch.invalid-table`, which means a table is mid-edit or a prize was
  deactivated without a replacement.
- **The marks always agree with the payout.** The outcome is drawn from
  the table first and the three symbols are dressed onto it, so three
  matching marks appear exactly when a card paid. Reconciliation checks
  this (`scratch-reveal-mismatch`); a finding there means the draw and the
  reveal have come apart, which players can see.
- **The pans is a shared progressive pool** funded by a slice of every
  scratch. Seeding never resets its balance — that is player money. A win
  against a short pool pays the configured floor and mints the shortfall,
  which is the only coin this feature creates from nothing. To take the
  feature down without touching balances, disable the chits
  (`item:lifecycle <slug> DISABLED`); the pool simply stops growing.
- **Retune through content only.** Edit `prisma/content/items/scratch-cards.ts`
  and reseed. `npm run content:validate` prints each card's expected
  return and refuses anything at or above 100% of the purchase price —
  that guard is the difference between a coin sink and an infinite-money
  bug, so do not route around it.
- **Never delete a prize row.** Seeding deactivates outcomes dropped from
  the file; `ScratchResult` rows reference them and history must keep
  resolving to what a player actually won.
- **Withdrawing a prize item is safe.** A scratch that lands on an item
  which is no longer distributable pays that item's reference price in
  coins instead, so retiring an item never turns an outcome into nothing.
- **`item:lifecycle <slug> DISABLED`** on a chit is the kill switch: it
  cannot be scratched (existing copies stay in satchels, nothing is lost)
  and it stops appearing in the stall.
- Reconciliation checks every scratch against its ledger row and refuses a
  result that paid both coins and an item, or neither.

## The Tumblehouse drums

Five tiers of token, sold at the Tumblehouse Counter and occasionally
found (ADR-49). Everything true of the chits above is true here, with the
same check names under `slot-` instead of `scratch-`:

- **The odds are not published.** Players see the prize ladder and which
  drum face pays each prize. If a tier's ACTIVE weights ever fail to total
  10000 basis points, pulling that tier is refused outright and nothing is
  consumed — watch for `slots.invalid-table`.
- **The drums always agree with the payout**, and the winning face is the
  one the ladder promised for that prize. Reconciliation checks both
  (`slot-reels-mismatch`).
- **Supply is tuned in the shop, not in code.** The chalk token is the
  only COMMON in the counter's pool, so every restock puts a few out; the
  green, blue and amber share the remaining slot and the black one is an
  independent 0.8% roll. Do not raise `targetListings` without adding
  COMMON pool entries — a shortfall backfills *downward*, so asking for
  more than the pool can supply pushes the surplus into cheaper tokens.
- **Retune through content only.** Edit `prisma/content/items/tokens.ts`
  and reseed. `npm run content:validate` prints each tier's expected
  return *and* its losing share, and refuses anything at or above 100% of
  the token price.
- **Never delete a prize row**; seeding deactivates dropped outcomes and
  `SlotSpin` rows reference them.
- **`item:lifecycle <slug> DISABLED`** on a token is the kill switch.
- A tier's `faces` count must equal its number of winning outcomes.
  Validation enforces it, and it is what keeps the published ladder
  complete by construction.

## Reading and the slate

- **Insight only ever accumulates** (ADR-50). Reconciliation checks that a
  companion's total equals what its shelf accounts for
  (`pet-insight-mismatch`); a finding means a reading was counted twice or
  a book was consumed for nothing. There is no path that lowers insight,
  and there should never be one.
- **A book with no `Book` row is unreadable.** Validation refuses a BOOK
  item without an entry in `prisma/content/items/books.ts`, which is the
  only thing standing between an author and a book players can buy but
  not read.
- **The slate is chalked lazily** (ADR-51) — the first player to open the
  Morning Slate on a given date generates it, under the primary key, and
  everyone else reads that row. There is no scheduler to keep running. If
  generation ever fails to hit medium in twelve tries it logs
  `sudoku.grade-missed` and ships the last uniquely-solvable board it got,
  recording the grade it actually achieved on the row.
- **`SudokuPuzzle.solution` is server-only.** It appears in no view model,
  log line, or error. If you are adding a surface that needs to know
  whether a grid is right, call `checkGrid` rather than reading the
  column.
- The slate pays once per player per game day, guarded by a status
  transition. Reconciliation refuses an unsolved attempt carrying a reward
  (`sudoku-reward-unexpected`).

## Restock scheduling (deployment requirement)

NPC shops restock on per-shop anchored intervals
(`NpcShopRestockConfig.intervalMinutes` + `anchorAt`; window k covers
`anchorAt + k·interval`). Two mechanisms cooperate, both calling the same
idempotent service:

1. **Scheduler** — an external cron calls the internal endpoint at least
   as often as the shortest shop interval (every 30 minutes is a good
   default):

   ```
   */30 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/internal/restock
   ```

2. **Lazy fallback** — loading a shop page or attempting a purchase after
   a missed window triggers the same restock service inline, using a
   **non-blocking** advisory lock: if another restock is already running,
   the prior valid inventory is served rather than the reader being held
   on the lock. Nothing is surfaced to the player — a shelf a moment out
   of date is not an error worth explaining.

Concurrency is safe by construction: a per-shop Postgres advisory lock
serializes execution, and the unique `(shopId, windowStart)` constraint on
`ShopRestock` guarantees one completed restock per window regardless of
how many schedulers, retries, or page loads race. Replacement is atomic —
players never observe an empty between-state. Failures persist a `FAILED`
restock row (outside the rolled-back transaction) with an attempt count;
the next trigger retries safely.

Restock timing is deliberately **never** rendered in UI, public APIs, or
error messages. Do not add countdowns.

## Daily activities

One global game day, resetting at 00:00 UTC, drives the word challenge,
prize wheel, and community meal (`src/server/modules/daily`). Operator
notes:

- **Puzzle scheduling.** The same cron call that restocks shops also
  pre-generates today's and tomorrow's word puzzles (idempotent). That is
  **96 rows a day** — three difficulties × 32 rotation bands — not three.
  Guess submission has a lazy fallback that creates only the one band the
  player needs, so a missed cron never blocks anybody; run the cron at
  least daily so the midnight rollover is seamless.
- **Per-account rotation (ADR-44).** Players are split into
  `WORD_BANDS` (32) bands and each band gets its own answer per
  difficulty per day, so a leaked answer is worth one band rather than the
  whole player base. A player's band is derived from their user id and is
  not stored, so raising the band count redistributes accounts with no
  migration. Which answer a band gets is an HMAC keyed by
  `DAILY_ROTATION_SECRET` over that difficulty's ordered ACTIVE answers
  (prisma/content/daily/word-answers.ts). Guesses are validated by shape
  only (exact-length A–Z) — there is no dictionary. Content edits (adding,
  deactivating, resequencing answers) may shift which answers FUTURE
  uncreated puzzles select; already-created puzzles are frozen and never
  rewritten. Each difficulty must keep ≥100 active answers (validated
  offline; totals and active counts reported separately).
- **Answers are frozen.** A puzzle's answer never changes once the row
  exists; regeneration (`puzzle:regenerate <date> <difficulty> [band]`)
  works only on future dates with zero player results and re-derives from
  the current active rotation. `puzzle:preview <date> [band]` prints one
  band's answers — treat as secret, and do not collect all 32 bands into
  one place, which would rebuild the leak the bands exist to prevent. Use
  `puzzle:band <username>` to find the band a specific player is in.
- **The lantern hunt (ADR-45).** One hiding place per band per game day,
  drawn by the same keyed rotation from the ACTIVE `LanternClue` rows. The
  cron pre-generates today's and tomorrow's (32 rows each); the notice
  board at The Quiet Beacon draws lazily if the cron has not run, so a
  missed cron never leaves a blank note. A clue row is what makes a
  location eligible — deactivate one to take a place out of the hunt
  without touching the world file, and existing hunts keep resolving
  because they freeze their clue reference at creation. Riddles are
  authored in prisma/content/daily/lantern-clues.ts; content validation
  refuses a published location with no clue and a clue that names its own
  location. Watch for `lantern.no-hiding-places` — it means every clue is
  inactive or every clued location is unpublished, and the hunt is down.
- **Rewards are per difficulty, never per band.** `puzzle:set-reward`
  applies to every band of that date and difficulty, and refuses the whole
  date once *any* band has a player result. Bands differ in their word and
  in nothing else.
- **Word content.** Authored in prisma/content/daily/word-answers.ts:
  append-only positions, per-entry deactivation, content-reviewed real
  words (no proper nouns, abbreviations, or moderation risks). Edit the
  file, `npm run content:validate`, reseed.
- **Wheel configuration.** Prize weights are basis points summing to
  10000, validated at seed time, spin time, and via `wheel:validate`.
  Recorded spins reference their configuration version forever: to change
  weights or prizes, seed a NEW version and deactivate the old one —
  never edit a version that has spins.
- **Reward items.** Wheel pools and the food pool only ever award
  currently distributable items (DRAFT/RETIRED/DISABLED are excluded at
  draw time), so disabling a broken item is safe: prior claims keep their
  records, and the pools route around it.
- **Player disputes.** `daily:inspect <username>` shows recorded daily
  outcomes with their ledger transaction ids. Failed operations recover
  through idempotent retry — never compensate by granting a second
  reward without checking the recorded outcome first.

## Request boards

Request boards are location activities (`prisma/content/requests/`). Each
player progresses independently through a board's ordered requests,
wrapping after the last active one.

- **Daily cap.** `RequestBoard.dailyCompletionLimit` bounds completions
  per player per UTC game day (the same game day as the dailies). Hitting
  the cap never removes the assigned request — it defers completion to the
  next reset, so nothing is lost by stopping.
- **Frozen assignments.** A request assigned to a player stays assigned
  even if the definition is later deactivated; completion is then refused
  explicitly rather than silently swapped. Deactivate-and-append is the
  safe way to retire a request.
- **History is immutable.** `RequestCompletion` stores the reward actually
  granted and a snapshot of the requirements consumed, linked to its
  ledger row. Never recompute an old completion from current content.
- **Economy.** Content validation refuses a reward that exceeds the NPC
  purchase cost of its requirements (guaranteed arbitrage) and prints a
  margin report per request at `npm run content:validate`.

## The Leaving Shelf

A communal free table at the Mossy Market: players leave spare stackable
goods, anybody may take one, and a lot expires two hours after it is left
(docs/architecture-decisions.md ADR-43).

- **No scheduled job. Ever.** Expiry is evaluated lazily on every read and
  again inside the taking transaction. There is nothing to schedule, and
  nothing breaks if a cron is down — an operator looking for a shelf
  sweeper should stop looking, because adding one would create a second
  mechanism that could disagree with the filter.
- **Rows are never deleted.** `GiveawayOffering` and `GiveawayTake` are
  history, and the day's caps are counted from them. Growth is bounded by
  the caps below, on the order of the `ForageFind` table.
- **Limits**, in `src/server/modules/giveaway/config.ts`: 10 donations and
  5 takes per player per UTC game day, 40 live lots on the shelf, 5 copies
  per lot, one copy per lot per player. Both giving and taking also
  require the 24-hour account age that gates the player market
  (`TRADE_ELIGIBLE_AFTER_HOURS`).
- **No coins move.** Every ledger row the shelf writes has
  `coinsDelta = 0`, so it cannot affect reconciliation's wallet
  derivation and cannot become a faucet under any abuse.
- **Item kill switch.** Setting an item to `DISABLED` removes its lots
  from the shelf and refuses takes against them; those copies then expire
  rather than returning to the donor. That is intended — a shutoff should
  reduce the number of copies in circulation, not restore them.
- **Moderation.** There is no per-lot admin removal command. Setting the
  offending item's lifecycle to `DISABLED` clears every lot of it at once
  and is the intended lever; individual lots are gone within two hours
  regardless.

## Admin CLI

Operator commands run through role-gated domain services via:

```sh
npx tsx scripts/admin-cli.ts <command>
```

Run `npx tsx scripts/admin-cli.ts` with no arguments for the command
list: item lifecycle transitions (`item:lifecycle <slug> <state>`),
disabling/enabling NPC shops, player shops, and listings (escrow returns
to the seller), blocking an account from commerce, soft account
deactivation, ledgered grants, deterministic restock previews, manual
restock runs, and recent security events. Every command that changes
state records an `admin-action` security event; the read-only inspection
commands (`events:recent` and friends) query directly and record
nothing.

In-application admin surfaces must call the same services in
`src/server/modules/admin/operations.ts`, which enforce `User.isAdmin`
for any actor other than the CLI. Content creation/editing (regions,
locations, items, pools, schedules) is content-driven — edit the
TypeScript content files under `prisma/content/`, run
`npm run content:validate`, then `npm run db:seed` (idempotent upserts).
See `prisma/content/README.md`. The CLI covers operational toggles.

## Anti-abuse controls

- Per-account fixed-window rate limits (database-backed, multi-instance
  safe) on purchases, listing changes, claims, upgrades, and search —
  configured in `src/server/modules/commerce/config.ts`. Clients only
  ever see a generic "slow down" message.
- Idempotency keys are required on every economic mutation; keys are
  user+operation scoped, store their result for replay, and reject reuse
  with a different request fingerprint.
- `SecurityEvent` rows record rate-limit violations
  (`rate-limit-exceeded`), stale-stock purchase attempts
  (`stale-stock-attempt`), high-value purchases
  (`high-value-npc-purchase`, `high-value-player-purchase`), cron auth
  failures (`cron-auth-failure`), account deactivations
  (`account-deactivated`), admin actions (`admin-action`), daily rewards
  and duplicate daily claims (`daily-reward`, `daily-duplicate-claim`). Repeated stale-stock attempts trigger
  an `escalation-suggested` event — the intended hook point for CAPTCHA or
  manual review (deliberately not an automatic ban). Inspect with
  `admin-cli.ts events:recent`.
- Client IPs are only read from forwarding headers when
  `TRUSTED_PROXY=true`, and are stored only as truncated hashes for
  rate-limit bucketing — raw addresses are never persisted.
  `X-Real-IP` wins; otherwise the **last** `X-Forwarded-For` hop is used,
  because an appending proxy leaves the client's own claimed value first
  in the list.
- Authentication limits are layered by scope, and the scoping is the
  point. Per-identity limits (the account signing in, the name being
  registered) always apply. Per-origin limits apply only when there *is*
  a trustworthy origin: without one, every anonymous request would share
  a single bucket, which an abuser can exhaust to lock everyone else out
  — a shared bucket is a lockout lever, not a defense. The sole
  intentional exception is `SIGNUP_BURST_LIMIT`, a high global ceiling on
  account creation, where no per-player dimension exists before the
  account does. Hitting it is an operator signal, not a normal condition.
- **Sign-up needs a trusted proxy to be limited per actor. Deploy behind
  one.** The per-origin sign-up limit is inert unless `TRUSTED_PROXY=true`
  and a proxy that overwrites `X-Forwarded-For`/`X-Real-IP` sits in front;
  without that, `resolveClientOrigin` returns null (it will not trust a
  client-supplied header) and the *only* control on account creation is
  the global `SIGNUP_BURST_LIMIT`. A red-team confirmed the consequence: a
  single origin can mint accounts at the full global rate (≈4.5/s until
  the ceiling, then a fresh allotment each window), which is both an
  account-farming supply and a registration-DoS lever — one actor holding
  the global bucket at its limit refuses every legitimate new player. The
  economy is unaffected either way (the 24-hour trade gate, not the
  sign-up limit, is what stops mule farms — verified holding on both sides
  of every value-transfer path), but **account creation itself is only as
  bounded as the fronting proxy makes it.** Run behind one; a
  proof-of-work or CAPTCHA on sign-up is the next lever if abuse persists.
  The sliding window (below) closes the across-the-boundary doubling but
  does not substitute for a per-actor signal.
- Rate limiting slides rather than snapping to fixed windows
  (`security/rate-limit.ts`): the estimate counts the current bucket plus
  the decaying weight of the previous one, so any `windowSeconds` interval
  is bounded to roughly `limit` instead of up to twice it across a bucket
  seam. This matters most on `auth:sign-in:identity`, where a fixed window
  turned 10 attempts / 5 min into 20 in a burst.
- Rejected unauthenticated requests must not cost database work. The
  cron endpoint compares its bearer token in constant time and gates
  audit writes in-process before touching the database, so repeating an
  invalid request is not an amplification lever.
- Retention: cleanup helpers prune old `RateLimitWindow`, completed
  `IdempotencyKey`, expired `Session`, and low-severity `SecurityEvent`
  rows (called from the restock cron path). High-severity security
  events are kept. Expired sessions are already refused at every read;
  deleting them is data hygiene, so the table is not an indefinite record
  of who played and when.
- Signing in rotates this device's session: the previous token is
  deleted, not merely replaced in the cookie. Other devices are
  unaffected — that is what "sign out everywhere" is for.
- Every response carries `Content-Security-Policy`, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and
  (in production) HSTS, from `next.config.ts`. The CSP still allows
  `'unsafe-inline'` scripts because the App Router streams its RSC
  payload through inline tags; a nonce-based `script-src` needs
  middleware and is tracked follow-up work.
- CSRF: server actions rely on Next.js's built-in Origin/Host enforcement
  for non-GET requests; the cron endpoint uses its own bearer secret.
- Never expose security events, thresholds, IPs, or risk data to players.
- Random events are bounded four ways at once: an allow-list of eligible
  routes, a per-user anti-duplicate window, a randomized cooldown after
  each success, and an ordinary rate limit on the endpoint. The catalog's
  own ceilings (coin caps, no health loss, no instanced items) are
  enforced by `npm run content:validate`, so a bad definition fails CI
  rather than the economy. `RANDOM_EVENTS_ENABLED=false` stops everything
  without a deploy.
- Random-event telemetry is emitted as structured logs:
  `random-event.attempt` (eligible roll attempts),
  `random-event.suppressed` (with `reason: duplicate | cooldown`),
  `random-event.granted` (with event key, rarity, category, coins),
  `random-event.pool-empty` (a content problem — the eligible pool
  filtered to nothing), `random-event.effect-failed` (an event that rolled
  back), and `random-event.ineligible-route`. Grep `event=random-event.*`
  to audit pacing and payout rates.

## Incident playbook

| Situation | Action |
| --- | --- |
| Broken/abusive listing | `listing:disable <id>` (escrow returns to seller, history kept) |
| Item misconfigured | `item:lifecycle <slug> DISABLED`, fix seed, re-seed, `item:lifecycle <slug> ACTIVE` |
| Item leaving circulation permanently | `item:lifecycle <slug> RETIRED` (owners keep and can trade theirs) |
| NPC shop misbehaving | `npc-shop:disable <slug>`; `restock:preview` to debug the deterministic plan |
| Suspected bot account | `user:disable-commerce <username>`, review `events:recent`, ledger via psql |
| Missed restocks (cron outage) | No action usually needed (lazy fallback); `restock:run <slug>` to force |
| Repeated `FAILED` restocks | Read the stored `error` on `ShopRestock`, fix cause, `restock:run <slug>` |
| Economy looks wrong | `npx tsx scripts/reconcile.ts` first; repair only via ledgered admin commands |
| Compensation | `grant:item` / `grant:coins` (both ledgered as ADMIN_ADJUST) |
| Account closure request | `user:deactivate <username> <reason>` (soft; escrow returned, proceeds paid out, sessions revoked) |

## Account deletion

Ledger tables use `Restrict` foreign keys, so `DELETE FROM "User"` fails
while economic history exists — by design. Account closure is the soft
`user:deactivate` path above. A future legal-erasure workflow must
anonymize the account row (scrub username/hash) rather than cascade over
history.
