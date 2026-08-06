# Content Model

How game content is represented, and how to extend it without a schema
migration for every new ordinary category, location, or display choice.

## Items

An `Item` is any ownable object. Core columns:

- `slug` (stable identifier, never renamed once shipped), `name`,
  `description`, `artKey` (see [art-direction.md](./art-direction.md)),
  `price` (base value in coins, non-negative by DB CHECK), `tradeable`
  (whether future trading systems may move it between players).
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

## Inventory

`InventoryEntry` is `(userId, itemId, quantity)` with a unique pair, a
non-negative CHECK constraint, and rows kept at zero rather than deleted.
All mutations run inside database transactions in server services
(`src/server/services/`), using guarded updates (`quantity >= n`) so
concurrent requests cannot overspend.

## World

- `Region`: `slug`, `name`, `description`, `artKey`, `sortOrder`,
  `published`. Top-level areas of the world.
- `Location`: belongs to a region; same shape. Routing is by globally unique
  location slug (`/explore/<slug>`).

`published: false` content is invisible to players (services filter on it;
a location is public only if its region is also published). This is the
extension point for staging future content.

Future NPCs, shops-at-locations, seasons, weather, events, and discoverables
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
