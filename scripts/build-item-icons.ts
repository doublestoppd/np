/**
 * npm run art:icons — turns the sourced icon maps into the placeholder
 * artwork the game ships.
 *
 * Run it against a checkout of https://github.com/game-icons/icons:
 *
 *   git clone --depth 1 https://github.com/game-icons/icons /tmp/game-icons
 *   npm run art:icons -- /tmp/game-icons
 *
 * It owns everything it writes, so none of it can drift:
 *
 *   public/art/items/<artKey>.svg    one silhouette per item
 *   public/art/places/<artKey>.svg   one per location, region, and keeper
 *   src/components/art/sourced-icons.ts   the art keys that have one
 *   docs/art-credits.md              the attribution CC BY 3.0 requires
 *
 * Why a checkout rather than a fetch: the collection is the upstream
 * source of truth, and pinning to whatever it says today — rather than
 * whatever a URL returns during a future build — is what keeps a
 * reproducible build reproducible. Nothing in the app ever reaches out to
 * game-icons.net at runtime; these are our files once they land here.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ICON_AUTHORS,
  ITEM_ICON_MAP,
  KEEPER_ICON_MAP,
  PLACE_ICON_MAP,
} from "../src/lib/art-credits";

const KEYS_MODULE = "src/components/art/sourced-icons.ts";
const CREDITS = "docs/art-credits.md";

// Defaulted rather than narrowed: the checkout path is read inside
// writeSet(), and control-flow narrowing does not reach into a function
// body from module scope.
const source = process.argv[2] ?? "";
if (!source) {
  console.error(
    "Usage: npm run art:icons -- <path to a game-icons/icons checkout>",
  );
  process.exit(1);
}

/**
 * Pulls the drawn shape out of a collection icon.
 *
 * Every icon in the collection is a black background rectangle followed by
 * the white foreground, because the collection's own downloads offer
 * colour combinations. We want the shape alone: the app renders it as a
 * CSS mask and takes its colour from the palette, so a background
 * rectangle would mask the entire square and paint a solid block.
 *
 * The background is matched by its shape rather than by its position, so a
 * change upstream that reorders the paths fails here rather than turning
 * every picture into a coloured square.
 */
const BACKGROUND = /<path d="M0 0h512v512H0z"\s*\/>/;
const PATHS = /<path\b[^>]*\/>|<path\b[^>]*>[\s\S]*?<\/path>/g;

function shapeOf(svg: string, id: string): string {
  const withoutBackground = svg.replace(BACKGROUND, "");
  if (withoutBackground === svg) {
    throw new Error(
      `${id}: no background rectangle found — the upstream icon format changed, so the extraction below is no longer safe`,
    );
  }
  const paths = withoutBackground.match(PATHS);
  if (!paths || paths.length === 0) {
    throw new Error(`${id}: no drawn paths after removing the background`);
  }
  // Fill is irrelevant to a mask — only alpha matters — but stating it
  // keeps the file sensible when opened on its own, and keeps any stray
  // `fill="#fff"` from rendering white-on-white in a file viewer.
  return paths
    .map((path) =>
      path.replace(/\s*fill="[^"]*"/g, "").replace("<path", '<path fill="#000"'),
    )
    .join("");
}

const usedAuthors = new Set<string>();
const allEntries: Array<[string, string, string]> = [];

/**
 * Writes one set of silhouettes and returns its art keys in order.
 *
 * Reuse is rejected **within** a set and allowed across sets. Two items
 * sharing a shape is the failure the old placeholder had — a satchel is
 * scanned by shape long before it is read — but a place and an object
 * never appear beside each other, so the Deepwater Steps and the Sunken
 * Doorstep may both be a flight of stairs.
 */
function writeSet(
  set: string,
  outDir: string,
  map: Record<string, string>,
): string[] {
  const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  const seen = new Map<string, string[]>();

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const [artKey, icon] of entries) {
    const [author, name] = icon.split("/");
    if (!author || !name) {
      throw new Error(`${artKey}: "${icon}" is not <author>/<icon>`);
    }
    if (!ICON_AUTHORS[author]) {
      throw new Error(
        `${artKey}: no credit line for contributor "${author}" — add one to ICON_AUTHORS before using their work`,
      );
    }
    usedAuthors.add(author);

    const file = join(source, author, `${name}.svg`);
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      throw new Error(`${artKey}: ${icon} not found at ${file}`);
    }

    writeFileSync(
      join(outDir, `${artKey}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${shapeOf(raw, artKey)}</svg>\n`,
    );
    seen.set(icon, [...(seen.get(icon) ?? []), artKey]);
    allEntries.push([set, artKey, icon]);
  }

  const shared = [...seen.entries()].filter(([, keys]) => keys.length > 1);
  if (shared.length > 0) {
    throw new Error(
      `icons reused within "${set}":\n${shared
        .map(([icon, keys]) => `  ${icon} → ${keys.join(", ")}`)
        .join("\n")}`,
    );
  }
  return entries.map(([artKey]) => artKey);
}

const itemKeys = writeSet("item", "public/art/items", ITEM_ICON_MAP);
// Places and keepers share a directory: both are "not an item", both are
// rendered over a painted ground or frame, and one folder is one fewer
// path for a renderer to get wrong.
const placeKeys = writeSet(
  "place",
  "public/art/places",
  Object.fromEntries([
    ...Object.entries(PLACE_ICON_MAP).map(
      ([key, { icon }]) => [key, icon] as const,
    ),
    ...Object.entries(KEEPER_ICON_MAP),
  ]),
);

const list = (keys: string[]) =>
  keys.map((key) => `  ${JSON.stringify(key)},`).join("\n");

writeFileSync(
  KEYS_MODULE,
  `// Generated by scripts/build-item-icons.ts — do not edit by hand.
//
// Which art keys have a sourced silhouette on disk. Anything absent falls
// back to its original placeholder, so new content is never blocked on
// artwork and a missing file can never render as a solid coloured square.
export const ITEM_ICON_KEYS: ReadonlySet<string> = new Set([
${list(itemKeys)}
]);

export const PLACE_ICON_KEYS: ReadonlySet<string> = new Set([
${list(placeKeys)}
]);
`,
);

const credited = [...usedAuthors].sort().map((author) => {
  const { name, url } = ICON_AUTHORS[author] as {
    name: string;
    url: string | null;
  };
  return url ? `- [${name}](${url})` : `- ${name}`;
});

writeFileSync(
  CREDITS,
  `<!-- Generated by scripts/build-item-icons.ts — do not edit by hand. -->

# Art credits

## Sourced placeholder icons

The item silhouettes under \`public/art/items/\` and the place and
shopkeeper silhouettes under \`public/art/places/\` are derived from the
[game-icons.net](https://game-icons.net) collection
([source](https://github.com/game-icons/icons)), used under the
[Creative Commons Attribution 3.0 licence](https://creativecommons.org/licenses/by/3.0/).

They are modified: each icon's background rectangle is removed and the
remaining shape is rendered as a CSS mask so it takes its colour from the
game's palette tokens.

Icons by:

${credited.join("\n")}

These are placeholders. They stand in for original commissioned artwork
and carry no part of the world's identity (docs/art-direction.md). The
companions, the painted grounds every place stands on, the Hollow's
grounds, and all writing are original to this project.

### Per key

| Set | Art key | Icon |
| --- | --- | --- |
${allEntries
  .map(([set, artKey, icon]) => `| ${set} | \`${artKey}\` | \`${icon}\` |`)
  .join("\n")}
`,
);

console.log(
  `art:icons — ${itemKeys.length} items, ${placeKeys.length} places and keepers`,
);
console.log(
  `  public/art/items\n  public/art/places\n  ${KEYS_MODULE}\n  ${CREDITS}`,
);
