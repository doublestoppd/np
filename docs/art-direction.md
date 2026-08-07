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
- The current palette is a deliberately subdued "quiet woodland" placeholder:
  warm parchment neutrals with a moss-green accent. It carries no lore
  meaning and will be replaced by the final illustration palette.
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
| Location hero | Location page header, explore cards | `LocationArt` flat SVG, original |
| Hollow ground | Hollow scenes, public Hollow | `GroundArt` flat SVG, original |
| Shopkeeper portrait | NPC shop panels | `KeeperArt` flat SVG, original |
| Item icon | Inventory, shops, showcases, Hollow | sourced silhouette (see below) |
| Profile avatar | Future profile identity | none yet |
| Seasonal overlay | Future events dressing | none yet |

Placeholders are always rendered inside `ArtworkFrame`, which owns the crop,
aspect ratio, background wash, and border. Screens never size raw artwork
directly, so swapping placeholders for final paintings does not require
redesigning screens.

### Sourced placeholders

Item icons are the one role filled by outside work rather than by original
shapes, and the reason is coverage: there are ~90 specific objects, they are
scanned by shape before they are read, and four original shapes tinted by
category meant a Chipped Enamel Mug and a Salt Raker's Tally were the same
picture. Ninety original placeholder drawings would also violate the rule
directly below this one.

They come from [game-icons.net](https://game-icons.net) under CC BY 3.0 —
one coherent silhouette style across 4,000+ symbols, which is what makes
them consistent with each other. The pipeline:

- `src/lib/art-credits.ts` maps each item `artKey` to `<author>/<icon>`.
- `npm run art:items -- <checkout>` writes `public/art/items/<artKey>.svg`,
  the key set in `src/components/art/item-icons.ts`, and `docs/art-credits.md`.
- `ItemArt` and `FurnishingArt` draw them as a **CSS mask** so the colour
  comes from the palette, not from the file. Baking tint into 90 files would
  have broken the re-skin rule above.
- Anything with no icon falls back to its category shape, so new content is
  never blocked on artwork.

Rules for any sourced asset:

- **Licence and credit before use.** Only permissive licences (CC0, CC BY,
  or equivalent). Attribution goes somewhere a player can reach — `/credits`,
  linked from the footer of every screen — not only into a source file.
  `src/components/art/item-art.test.ts` fails if a contributor is used
  without a credit, or if two items share a silhouette.
- **No runtime hotlinks.** Assets are vendored into `public/`; nothing
  fetches from the source at runtime or at build time.
- **Never for identity.** Creatures, locations, grounds, and shopkeepers
  stay original: they carry the world's identity, a sourced creature would
  be somebody else's creature, and `PetArt` additionally responds to spirits
  and age in a way a static icon cannot. Sourced work is for generic objects
  only.

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
