# Adversarial cheat audit — August 2026

Three independent attacker agents were turned loose on a live production
build (`127.0.0.1:3200`) with full white-box source access and a disposable
copy of the database, each on a different surface and each instructed to
verify every claim against the ledger/DB rather than assert it. A fourth
economy pass ran alongside. Every "confirmed" line below was executed and
read back from the database.

## Headline

**No exploit was found.** Nobody minted a coin or duplicated an item that
should not exist. Every duplication, replay, race, negative-value, IDOR,
forged-minigame-score, and mule-funnel attempt was correctly defended, and
whole-database reconciliation held (`coins = 200 + Σ ledger` for every
real user; no negative balances or quantities anywhere).

What the attackers *did* surface was a handful of low-severity robustness
issues and two design residuals that were already documented. The
robustness issues are fixed in this change. Of the two residuals, the
first (the global daily word) has since been closed by ADR-44; the second
is a deployment decision and is called out below.

## What held (attacked, DB-verified)

- **Idempotency** — replay, key-reuse-with-different-payload, and 20×5
  concurrent same-key bursts: exactly one execution each, charged/granted
  once. Keys are `(userId, operation, key)`-scoped and created inside the
  mutation transaction.
- **Guarded writes everywhere** — NPC last-unit oversell, double proceeds
  claim, giveaway last-copy race, partial-purchase conservation, concurrent
  correct word solve, concurrent wheel/meal/forage: every one settled to
  exactly the intended single grant. Debits/decrements are
  `updateMany(where balance/qty/status ≥ …)` backed by DB CHECK constraints.
- **The 24-hour trade gate holds on both sides of both value-transfer
  paths** — `createListing`, `purchaseListing`, `leaveOnShelf`,
  `takeFromShelf` all refuse `ACCOUNT_TOO_NEW`. It is the only cross-account
  ledger movement (`PLAYER_SALE`, `GIVEAWAY_TAKE`); everything else credits
  the actor's own account. The Hollow only debits the actor and grants
  non-tradeable furnishings.
- **The Sorting Bench is server-authoritative** — the client submits only
  shelf indices; the score is replayed from a server-only seed that never
  leaves the server; a stale window resubmit is `STALE_BATCH`; a cross-user
  `runId` is `RUN_NOT_FOUND`. There is no score or board field to forge.
- **Ownership is re-checked inside the writing transaction** — feeding,
  repricing, cancelling, and featuring another account's pet/listing/shop
  all fail (`PET_NOT_FOUND` / `LISTING_NOT_FOUND` / `PET_NOT_OWNED`).
- **Validation, money, auth** — Zod rejects negative/oversized/typed-wrong
  input; money is bigint end-to-end; forged/absent session cookies redirect
  to sign-in; `isAdmin` cannot be set at sign-up and admin ops have no web
  route.

## Fixed in this change

1. **Rate-limit boundary doubling** (`security/rate-limit.ts`). The fixed
   window allowed the full limit at the end of one bucket and again at the
   start of the next — up to 2× across the seam (e.g. 10 sign-in attempts /
   5 min became 20 in a burst). Replaced with a sliding-window counter
   (current bucket + decaying weight of the previous), so any interval is
   bounded to ≈ limit. Single-window behaviour is unchanged.

2. **Raw `P2002` on lazy first-use** (`daily/word/game.ts`,
   `player-shops/commands/shop.ts`). Prisma's `upsert` reads-then-inserts,
   so a concurrent first guess-of-the-day or first listing could raise a
   raw constraint error that surfaced as a generic failure and was logged
   as a defect — contradicting the error contract. No corruption (the
   transaction rolled back), but the wrong outcome. Both now use the
   create-then-catch-and-reread pattern the codebase already uses in three
   other places; the word board is ensured before its transaction so a
   `P2002` never aborts it.

3. **Sorting move regex admitted a non-existent shelf** (`lib/validation.ts`).
   `moves` accepted `[0-4]` but there are four shelves (`0-3`). The stray
   `4` was already caught before any state change; the schema now matches
   the domain.

4. **Test hygiene** — an eager-promise pattern in the giveaway suite logged
   an unhandled rejection (test passed, vitest complained); made lazy. A
   global-count assertion in the same suite could flake under full-suite
   load; it now clears the shared shelf.

## Design residuals — your call

These are not bugs; they are documented trade-offs the attackers confirmed
are live. Neither is fixed here because both reverse a deliberate decision.

1. ~~**Daily word answer is global and farmable at ~210
   coins/account/day**~~ (`ADR-42`). One sacrifice account failed, the
   game revealed the answer, and any number of mules solved first-try for
   30+60+120. **Closed — the rotation is built (`ADR-44`).**
   `DailyWordPuzzle` is now unique on `(gameDate, difficulty, band)` over
   32 bands; a player's band comes from their user id and a band's answer
   from an HMAC keyed by `WORD_ROTATION_SECRET`. Because the derivation is
   keyed rather than arithmetic, mapping the bands once buys nothing: the
   farm costs one burned account per band per day, permanently, instead of
   three free answers a day. Writing it also turned up a real defect in
   the neighbourhood — the admin reward edit would have repriced the
   unplayed bands of an already-played date — fixed in the same change.

2. **Account creation is only as bounded as the fronting proxy.** The
   per-origin sign-up limit is inert unless `TRUSTED_PROXY=true` and a
   header-overwriting proxy sits in front; otherwise the only control is
   the global `SIGNUP_BURST_LIMIT`. One origin can then mint accounts at
   the full global rate — an account-farming supply and a registration-DoS
   lever (holding the global bucket at its limit refuses every legitimate
   new player). The economy is unaffected (the trade gate, not the sign-up
   limit, stops mule value). This is inherent to having no per-actor signal
   without a proxy; the sliding-window fix reduces the burst but cannot
   substitute for one. **Recommend: deploy behind a rate-limiting proxy
   with `TRUSTED_PROXY=true`; add a CAPTCHA/proof-of-work on sign-up if
   abuse persists.** Documented in `operations.md`.

## Note on the run

The attackers created throwaway accounts and made transient stock edits in
the **dev** database (disposable by policy). They cleaned up after
themselves and left reconciliation clean; a `db:fresh` restores a pristine
state regardless. No source was modified by the attackers.
