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
| `APP_URL` | Canonical public URL. Required in production. |
| `TRUSTED_PROXY` | Must be explicitly `"true"` or `"false"` in production. Only when `true` are `x-forwarded-for` addresses trusted for rate-limit context; never enable it unless a proxy you control sets the header. |

**Startup validation.** `src/instrumentation.ts` runs
`assertValidServerConfig()` on boot. In production, a missing variable or
a known development fallback value (`dev-local-restock-seed`, …) crashes
startup with the offending variable names — misconfiguration fails
loudly, never silently. In development the same problems log a warning.

## Health and readiness

- `GET /api/health` — process is up (no dependencies touched).
- `GET /api/ready` — verifies a database round-trip; 503 with a reason
  when the database is unreachable. Point load balancers and uptime
  checks here.

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
into a fresh database and switch — never `pg_restore --clean` over the
live one while the app is running.

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
orphaned escrow, sold listings missing buyer/ledger rows, shop revenue
and till totals, NPC stock vs purchase ledger, stale idempotency records,
starter-claim invariants, invalid showcase references, and the daily
activities (solved word results and wheel/meal rewards must match their
ledger rows exactly; duplicate daily records are impossible by unique
constraint). Run it after
restores, after incidents, and on a schedule (daily is cheap). It never
repairs data — repairs are explicit admin operations, so every fix leaves
an audit trail.

**Alert conditions worth wiring up:** any reconciliation finding;
`/api/ready` failing; a `FAILED` row in `ShopRestock` (`attemptCount`
climbing means the lazy path keeps failing too); a spike in
`SecurityEvent` rows of type `rate-limit` or `stale-stock`; any
`cron-auth-failure` event; a `cron.puzzle-generation-failed` log line or
`PUZZLE_POOL_EMPTY` errors (today's word puzzles are missing); repeated
`INVALID_WHEEL_CONFIG` errors or `daily-wheel.pool-empty` warnings; an
abnormal prize distribution in the `daily-wheel.spin` logs (group by
`prizeId` per day and compare against the configured weights).

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
   the reader is told "restocking" rather than being held on the lock.

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
  pre-generates today's and tomorrow's word puzzles (idempotent). Guess
  submission has a lazy fallback, so a missed cron never blocks players —
  but run the cron at least daily so the midnight rollover is seamless.
- **Answer rotation.** Each difficulty rotates through its ordered ACTIVE
  answers (prisma/content/daily/word-answers.ts), one per UTC game day
  from the documented epoch, wrapping after the last. Guesses are
  validated by shape only (exact-length A–Z) — there is no dictionary.
- **Answers are frozen.** A puzzle's answer never changes once the row
  exists; regeneration (`puzzle:regenerate`) works only on future dates
  with zero player results and re-derives from the current active
  rotation. `puzzle:preview <date>` prints answers — treat as secret.
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
restock runs, and recent security events. Every command records an
`admin-action` security event.

In-application admin surfaces must call the same services in
`src/server/modules/admin/operations.ts`, which enforce `User.isAdmin`
for any actor other than the CLI. Content creation/editing (regions,
locations, items, pools, schedules) is currently seed-driven — edit
`prisma/seed.ts` and re-run `npm run db:seed` (idempotent upserts) — with
the CLI covering operational toggles.

## Anti-abuse controls

- Per-account fixed-window rate limits (database-backed, multi-instance
  safe) on purchases, listing changes, claims, upgrades, and search —
  configured in `src/server/modules/commerce/config.ts`. Clients only
  ever see a generic "slow down" message.
- Idempotency keys are required on every economic mutation; keys are
  user+operation scoped, store their result for replay, and reject reuse
  with a different request fingerprint.
- `SecurityEvent` rows record rate-limit violations, stale-stock purchase
  attempts, high-value purchases, cron auth failures, account
  deactivations, and admin actions. Repeated stale-stock attempts trigger
  an `escalation-suggested` event — the intended hook point for CAPTCHA or
  manual review (deliberately not an automatic ban). Inspect with
  `admin-cli.ts events:recent`.
- Client IPs are only read from `x-forwarded-for` when
  `TRUSTED_PROXY=true`, and are stored only as truncated hashes for
  rate-limit bucketing — raw addresses are never persisted.
- Retention: cleanup helpers prune old `RateLimitWindow`, completed
  `IdempotencyKey`, and low-severity `SecurityEvent` rows (called from
  the restock cron path). High-severity security events are kept.
- CSRF: server actions rely on Next.js's built-in Origin/Host enforcement
  for non-GET requests; the cron endpoint uses its own bearer secret.
- Never expose security events, thresholds, IPs, or risk data to players.

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
