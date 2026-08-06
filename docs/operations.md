# Operations

Operator procedures for the world/commerce systems. All administrative
paths disable rather than delete, so ledger, restock, listing, and sale
history always survives.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection (never exposed to clients) |
| `RESTOCK_SEED_SECRET` | HMAC secret for deterministic restock generation. **Required in production**; a dev-only fallback exists so local setups work. Rotating it changes all future restock results (past records keep their stored summaries). The raw secret is never stored in the database — only derived `seedId` identifiers. |
| `CRON_SECRET` | Bearer token for the internal restock endpoint. Without it the endpoint rejects everything. |

## Restock scheduling (deployment requirement)

NPC shops restock on per-shop fixed intervals (default every 8 hours,
UTC-aligned windows). Two mechanisms cooperate, both calling the same
idempotent service:

1. **Scheduler** — an external cron calls the internal endpoint at least as
   often as the shortest shop interval (hourly is a good default):

   ```
   */30 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/internal/restock
   ```

2. **Lazy fallback** — loading a shop page or attempting a purchase after a
   missed window triggers the same restock service inline.

Concurrency is safe by construction: a per-shop Postgres advisory lock
serializes execution, and the unique `(shopId, windowStart)` constraint on
`ShopRestock` guarantees one completed restock per window regardless of how
many schedulers, retries, or page loads race. Replacement is atomic —
players never observe an empty between-state.

Restock timing is deliberately **never** rendered in UI, public APIs, or
error messages. Do not add countdowns.

## Admin CLI

Operator commands run through role-gated domain services via:

```sh
npx tsx scripts/admin-cli.ts <command>
```

Run `npx tsx scripts/admin-cli.ts` with no arguments for the command list:
disabling/enabling items, NPC shops, player shops, and listings (escrow
returns to the seller), blocking an account from commerce, ledgered
grants, deterministic restock previews, manual restock runs, and recent
security events. Every command records an `admin-action` security event.

In-application admin surfaces must call the same services in
`src/server/services/admin.ts`, which enforce `User.isAdmin` for any actor
other than the CLI. Content creation/editing (regions, locations, items,
pools, schedules) is currently seed-driven — edit `prisma/seed.ts` and
re-run `npm run db:seed` (idempotent upserts) — with the CLI covering
operational toggles.

## Anti-abuse controls

- Per-account fixed-window rate limits (database-backed, multi-instance
  safe) on purchases, listing changes, claims, upgrades, and search —
  configured in `src/server/services/economy/config.ts`. Clients only ever
  see a generic "slow down" message.
- Idempotency keys are required on every economic mutation; keys are
  user+operation scoped, store their result for replay, and reject reuse
  with a different request fingerprint.
- `SecurityEvent` rows record rate-limit violations, stale-stock purchase
  attempts, high-value purchases, cron auth failures, and admin actions.
  Repeated stale-stock attempts trigger an `escalation-suggested` event —
  the intended hook point for CAPTCHA or manual review (deliberately not an
  automatic ban). Inspect with `admin-cli.ts events:recent`.
- CSRF: server actions rely on Next.js's built-in Origin/Host enforcement
  for non-GET requests; the cron endpoint uses its own bearer secret.
- Never expose security events, thresholds, IPs, or risk data to players.

## Incident playbook

| Situation | Action |
| --- | --- |
| Broken/abusive listing | `listing:disable <id>` (escrow returns to seller, history kept) |
| Item misconfigured | `item:disable <slug>`, fix seed, re-seed, re-enable |
| NPC shop misbehaving | `npc-shop:disable <slug>`; `restock:preview` to debug the deterministic plan |
| Suspected bot account | `user:disable-commerce <username>`, review `events:recent`, ledger via psql |
| Missed restocks (cron outage) | No action usually needed (lazy fallback); `restock:run <slug>` to force |
| Compensation | `grant:item` / `grant:coins` (both ledgered as ADMIN_ADJUST) |

## Account deletion

Ledger tables use `Restrict` foreign keys, so `DELETE FROM "User"` fails
while economic history exists — by design. A future deletion feature must
anonymize the account row rather than cascade over history.
