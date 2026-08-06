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
| Creature portrait | Pet home, profile featured pet, pickers | `PetArt` flat SVG |
| Location hero | Location page header, explore cards | `LocationArt` flat SVG |
| Item icon | Inventory, showcases | `ItemArt` flat SVG |
| Profile avatar | Future profile identity | none yet |
| Seasonal overlay | Future events dressing | none yet |

All placeholder SVGs are original, deliberately simple, and always rendered
inside `ArtworkFrame`, which owns the crop, aspect ratio, background wash,
and border. Screens never size raw artwork directly, so swapping placeholder
SVGs for final paintings does not require redesigning screens.

## Asset naming convention (manifest)

Final raster art ships as static files under `public/art/`, keyed by the
`artKey` columns already present on species, items, and locations
(`artKey` defaults to the content slug):

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
  style.
- New content must ship with an `artKey` and a placeholder rendering path
  from day one, so final art can land as a pure asset drop.
