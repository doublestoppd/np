# Art Direction

Working visual rules for the period **before** the final world identity and
commissioned illustration exist. Nothing in this document defines the final
look; everything here is built to be replaced.

## Target

Fantasy hand-painted storybook illustration: warm, atmospheric, expressive
creatures, painterly environments. The interface stays modern and restrained
so the artwork carries the world's personality.

Explicitly **not**: pixel art, low-resolution sprites, retro-game UI chrome,
scanline/CRT effects, or heavy ornamental borders. Do not simulate
"hand-painted" with CSS filters or noise textures.

## Interface principles

- Mobile-first; every screen must work at 360 CSS pixels with no horizontal
  overflow and touch targets of at least 44px.
- Light presentation first. Dark mode is deferred until the final palette
  exists.
- Semantic design tokens only (see `src/app/globals.css` `@theme` block):
  `background`, `surface`, `surface-raised`, `text`, `text-muted`, `border`,
  `accent`, `success`, `warning`, `danger`, stat colors, radii, shadows, and
  motion timing. Components must consume tokens, never raw hex values, so the
  entire presentation can be re-skinned by editing one file.
- The palette is warm parchment neutrals, a moss-green accent for anything
  interactive, and a **six-hue tint palette** (`--color-tint-*`: berry,
  ember, honey, moss, tide, dusk) that content draws from. Values carry no
  lore meaning and will be replaced by the final illustration palette; the
  structure should survive it.
- **A tint must be earned.** A hue is only ever applied to something a
  player could also read in words — an item's category, a tag's family, a
  place's character, which activity a row is for. Nothing is tinted at
  random and nothing is tinted by *worth*: an expensive item and a cheap
  one of the same kind wear the same colour, because a palette that encodes
  value turns a satchel into a leaderboard. The assignments live in one
  table, `src/lib/content-tint.ts`.
- **Unrelated things must not share a scale.** Rarity used to borrow the
  status tones, so a "Rare" chip and an "Available" chip were the same
  green and colour on the page taught players nothing. Rarity has its own
  tokens now; state keeps `accent`/`success`/`warning`/`danger`.
- Contrast is asserted, not eyeballed: `src/app/palette.test.ts` reads
  `globals.css` and fails any text pairing under 4.5:1, any item ink under
  3:1 on the artwork wash, and any two tints too close to tell apart. It
  found two shipped failures the first time it ran.
- Typography: system sans for UI text, system serif stack (`font-display`)
  for headings to hint at the storybook tone. No remote fonts at runtime; a
  licensed display face can replace the serif stack later by editing the
  `--font-display` token.
- Motion is subtle and optional: interface transitions only, always honoring
  `prefers-reduced-motion` (a global rule disables animation/transitions).
  No essential state may be communicated only through animation.
- Texture, gradient, and ornament are used sparingly (e.g. the soft wash
  inside `ArtworkFrame`); legibility and speed win every conflict.

## Art asset roles

| Role | Purpose | Placeholder today |
| --- | --- | --- |
| Creature portrait | Pet home, profile featured pet, pickers | `PetArt` flat SVG, original |
| Painted ground | Location and region art, Hollow scenes | original flat SVG |
| Location subject | Location page header, explore cards, world map | sourced silhouette (see below) |
| Shopkeeper portrait | NPC shop panels | original frame + sourced silhouette |
| Item icon | Inventory, shops, showcases, Hollow | sourced silhouette (see below) |
| Profile avatar | Future profile identity | none yet |
| Seasonal overlay | Future events dressing | none yet |

Placeholders are always rendered inside `ArtworkFrame`, which owns the crop,
aspect ratio, background wash, and border. Screens never size raw artwork
directly, so swapping placeholders for final paintings does not require
redesigning screens.

### Sourced placeholders

Objects and subjects are filled by outside work rather than by original
shapes, and the reason is coverage: ~90 specific items plus ~20 places and
shopkeepers, all scanned by shape before they are read. Four original
shapes tinted by category meant a Chipped Enamel Mug and a Salt Raker's
Tally were the same picture; sixteen hand-drawn location scenes were
sixteen different qualities, and the world map had no subject at all.
A hundred original placeholder drawings would also violate the rule
directly below this one.

They come from [game-icons.net](https://game-icons.net) under CC BY 3.0 —
one coherent silhouette style across 4,000+ symbols, which is what makes a
hundred of them consistent with each other. The pipeline:

- `src/lib/art-credits.ts` maps each `artKey` to `<author>/<icon>`:
  `ITEM_ICON_MAP`, `PLACE_ICON_MAP` (which also names the region's ground),
  and `KEEPER_ICON_MAP`.
- `npm run art:icons -- <checkout>` writes `public/art/{items,places}/`,
  the key sets in `src/components/art/sourced-icons.ts`, and
  `docs/art-credits.md`.
- Everything draws through `SourcedArt`, a **CSS mask** so the colour comes
  from the caller and the palette, not from the file. Baking tint into a
  hundred files would have broken the re-skin rule above.
- Anything with no icon falls back to its original placeholder, so new
  content is never blocked on artwork.

**The ground stays ours.** A sourced subject always stands on an original
painted ground — woodland green or the salt flats' grey — and that split is
deliberate. The ground is what makes Saltmere not look like Dapplewood, and
no borrowed icon can carry a region's weather. The Hollow's grounds take no
sourced subject at all: the ground there is a stage, and the furnishings the
player arranges are the subject.

Rules for any sourced asset:

- **Licence and credit before use.** Only permissive licences (CC0, CC BY,
  or equivalent). Attribution goes somewhere a player can reach — `/credits`,
  linked from the footer of every screen — not only into a source file.
  `src/components/art/sourced-art.test.ts` fails if a contributor is used
  without a credit, or if two things in one set share a silhouette.
- **No runtime hotlinks.** Assets are vendored into `public/`; nothing
  fetches from the source at runtime or at build time.
- **Never the companions.** `PetArt` stays original, and the reason is
  functional rather than aesthetic: it responds to spirits and to how many
  seasons a companion has been yours, which is the picture agreeing with
  what the meters say in words (ADR-27). A single static silhouette cannot
  do that, so swapping one in would delete feedback, not just change a
  style. They are also the one thing on screen a player thinks of as
  *theirs*.

## Asset naming convention (manifest)

Final raster art ships as static files under `public/art/`, keyed by the
`artKey` columns already present on species, items, and locations
(`artKey` is required on every content object and conventionally equals the slug):

```
public/art/creatures/<artKey>/portrait.webp   1:1, transparent bg, >= 512px
public/art/creatures/<artKey>/full.webp       4:5, transparent bg, >= 1024px tall
public/art/locations/<artKey>/hero.webp       16:9, full-bleed, >= 1280px wide
public/art/locations/<artKey>/card.webp       3:2, full-bleed, >= 640px wide
public/art/items/<artKey>.webp                1:1, transparent bg, >= 256px
public/art/avatars/<artKey>.webp              1:1, >= 256px (future)
public/art/seasonal/<event>/<artKey>.webp     (future)
```

Rules:

- WebP (or AVIF) only; target ≤ 200 KB for heroes, ≤ 50 KB for icons. No
  large unoptimized files, no external image hotlinks.
- Creature and item art is delivered on transparency so frames can restyle
  backgrounds per context. Location art is full-bleed.
- `ArtworkFrame` supports `square`, `wide` (16:9), and `portrait` (4:5)
  aspects — supply crops that read well in all breakpoints of the target
  role; faces and focal subjects belong in the center 60%.
- Every rendered artwork needs meaningful alt text describing the subject
  ("Sprig, a Thornbud"), or empty alt when purely decorative next to an
  equivalent text label.

## Placeholder policy

- Placeholders stay flat, friendly, and obviously provisional; do not invest
  in detailed placeholder art that would create attachment to a temporary
  style. Sourced silhouettes satisfy this by construction — they are
  legible and plainly not the painted target.
- New content must ship with an `artKey` and a placeholder rendering path
  from day one, so final art can land as a pure asset drop.
- A new item should get an entry in `src/lib/art-credits.ts` in the same
  change. The test suite requires it, because the alternative — falling back
  to a category shape — is the illegible state this replaced.
