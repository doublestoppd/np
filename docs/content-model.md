# Content Model

How game content is represented, and how to extend it without a schema
migration for every new ordinary category, location, or display choice.

## Items

An `Item` is the definition (catalog entry) of any ownable object. Core
columns:

- `slug` (stable identifier, never renamed once shipped), `name`,
  `description`, `artKey` (see [art-direction.md](./art-direction.md)),
  `price` (estimated base value in coins, non-negative by DB CHECK; shops
  price independently), `tradeable` (whether player shops may move it
  between players), `rarity` (general rarity ladder — shop pools may assign
  a different shop-specific rarity), `stackable`, `provenancePolicy`,
  `lifecycle` (`DRAFT`/`ACTIVE`/`RETIRED`/`DISABLED` — see ADR-18, not a
  boolean `active`), and `releasedAt`/`retiredAt`, stamped by
  `setItemLifecycle` when a definition first enters and first leaves
  circulation.
- `type` (`ItemType?`) — the **typed use-effect discriminator**, not a
  display category. `FOOD` items can be fed (`hungerRestore`), `TOY` items
  will be playable (`happinessBoost`), `null` means the item has no use
  effect (curios, decorations, keepsakes). The enum only grows when a
  genuinely new *game mechanic* ships (which requires service code and tests
  anyway) — never for a new kind of possession.
- `categoryId` → `ItemCategory` (data-driven display categorization).
- `tags` → `ItemTag[]` (many-to-many, descriptive attributes).

### Categories vs tags vs type

| Concern | Mechanism | Adding one requires |
| --- | --- | --- |
| Gameplay effect (feedable, playable…) | `ItemType` enum + typed columns | migration + service + tests |
| Display categorization (Food, Toys, Curios…) | `ItemCategory` row | seed data only |
| Descriptive attributes (foraged, river, keepsake…) | `ItemTag` rows | seed data only |

Critical gameplay values stay in typed, validated columns
(`hungerRestore`, `happinessBoost`, `price`). Do **not** move economy rules
or pet-stat mutations into JSON blobs, and do not build a universal
item-effect scripting language.

### Categories and tags are descriptive, never prescriptive

They power search, filtering, and browsing. They must never become official
collection checklists, completion tracks, or set definitions — see
[profile-and-showcases.md](./profile-and-showcases.md).

## Ownership (hybrid model)

- **Stackable** items use `InventoryEntry` `(userId, itemId, quantity)` with
  a unique pair, a non-negative CHECK constraint, and rows kept at zero
  rather than deleted.
- **Non-stackable** items use per-copy `ItemInstance` records (owner,
  status `OWNED` or `ESCROWED`, acquisition source). History lives in the
  append-only `ItemProvenanceEvent` table, never in mutable JSON (ADR-17).
  Items whose provenance policy is not `NONE` must be instanced.

Provenance policies: `NONE` (audit ledger only), `ORIGINAL_SOURCE` (how the
copy first entered circulation), `FULL_HISTORY` (plus notable transfers).
Provenance events are appended only by server services.

All mutations run inside database transactions in server services
(`src/server/modules/commerce/`), using guarded updates so concurrent
requests cannot overspend, oversell, or double-claim. Every economic
mutation writes an append-only `Transaction` ledger row; ledger foreign
keys use `Restrict` so cascades can never destroy history.

## World

Navigation is page-based: **World Map → Region Map → Location** —
`/explore`, `/explore/<region>`, `/explore/<region>/<location>`. Locations
are content pages, not simulated spaces: no exits, adjacency, coordinates,
movement, or world simulation.

- `Region`: `slug`, `name`, `description`, `artKey`, `sortOrder`,
  `published`, timestamps. Top-level areas of the world.
- `Location`: belongs to a region; same shape plus optional `mapX`/`mapY`
  marker percentages (0–100, CHECK-constrained) for the illustrated region
  map on larger screens. Card/list navigation is the mobile-first fallback
  and always present.

Every location page provides a Back to Map link that resolves directly to
its containing region route (never browser history).

`published: false` content is invisible to players (services filter on it;
a location is public only if its region is also published). This is the
extension point for staging future content.

## NPC shops

An `NpcShop` is a feature of exactly one location (`locationId` unique) —
the shop *is* the location page's content. The shopkeeper is static
presentation — a portrait (`keeperArtKey`, drawn by
`components/art/keeper-art.tsx`) beside fixed flavor copy — and
deliberately not a character system: no NPC records, dialogue, schedules,
or state.

- `NpcShopPoolEntry`: what a shop can stock — per-shop rarity, fixed price,
  selection weight, inclusive quantity bounds, and optional
  `availableFrom`/`availableUntil` dates (explicit windows; not a season
  engine).
- `NpcShopRestockConfig`: per-shop schedule (interval minutes, target
  listings, per-tier slot bounds, ultra-rare basis points). Defaults match
  the documented cadence (8h, 12 listings, 7–9/2–4/0–2, 3% ultra).
- `ShopRestock` + `NpcShopStock`: one auditable restock record per
  scheduled window (unique), with fully-replaced stock rows that survive as
  `SOLD_OUT`/`EXPIRED` history.

Restock schedules are hidden from players everywhere.

## Player shops

One persistent fixed-price `PlayerShop` per account (created lazily at
first visit). `PlayerShopListing` rows are both the listing and the escrow:
stackable quantities leave inventory when listed; instances flip to
`ESCROWED`. Proceeds accumulate in the shop till (`unclaimedProceeds`) and
move to the wallet only via an explicit claim. Capacity grows through
content-configured `PlayerShopUpgradeTier` purchases. No fees, taxes,
auctions, or price ceilings beyond integer safety.

Future NPCs-as-characters, seasons, weather, events, and discoverables
should hang off `Location`/`Region` by id — add models when the feature
ships, not before. Current placeholder names (Dapplewood etc.) carry no lore
commitment and are safe to replace wholesale before launch.

## Profiles and showcases

See [profile-and-showcases.md](./profile-and-showcases.md). Summary:
`Profile` is a 1:1 extension of `User` holding public-safe fields (bio,
title, featured pet); `ShowcaseEntry` stores ordered references
(`userId`, `itemId`, `position`) to owned items — references only, never
duplicated item data.

## Extension playbook

- New ordinary item kind → add an `ItemCategory`/`ItemTag` seed row and item
  rows. No migration.
- New usable mechanic → add an `ItemType` value + typed effect column(s) +
  service + tests + migration. Deliberately heavier.
- New area → seed `Region`/`Location` rows (start `published: false`).
- New profile display choice → prefer a typed column or small table keyed by
  user id; keep public reads filtered through the profile service.
- Anything requiring per-item arbitrary behavior → stop; that is the
  scripting engine we are explicitly not building.
