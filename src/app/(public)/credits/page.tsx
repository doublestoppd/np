import type { Metadata } from "next";
import { creditedAuthors } from "@/lib/art-credits";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";

export const metadata: Metadata = { title: "Credits" };

/**
 * Where borrowed work is credited.
 *
 * The borrowed silhouettes are used under CC BY 3.0, which asks for
 * attribution. A name in a source file nobody renders is not attribution,
 * so it lives on a page a player can open, linked from the footer of every
 * screen — and a test asserts the credits stay in step with what is
 * actually used.
 *
 * **The author list is built from all three maps**, not just the items.
 * Places and shopkeepers are drawn from the same collection, and for a
 * while this page said they were original while rendering somebody else's
 * work for them — an attribution failure, not a wording slip. Reading
 * every map also means the list cannot quietly go incomplete when a place
 * icon by a new author is added.
 *
 * What remains original is stated narrowly and truthfully, because the
 * point of the page is to say which parts are ours and which are somebody
 * else's rather than leaving a reader to guess.
 */
export default function CreditsPage() {
  const authors = creditedAuthors();

  return (
    <>
      <PageHeader
        title="Credits"
        description="What here was made by somebody else, and under what terms."
      />

      <Surface as="section" raised className="mb-5">
        <h2 className="font-display text-lg font-semibold text-text">
          Borrowed artwork
        </h2>
        <p className="mt-2 max-w-prose text-sm text-text-muted">
          The object, place, and shopkeeper silhouettes come from the{" "}
          <TextLink href="https://game-icons.net">game-icons.net</TextLink>{" "}
          collection, used under the{" "}
          <TextLink href="https://creativecommons.org/licenses/by/3.0/">
            Creative Commons Attribution 3.0 licence
          </TextLink>
          . They are modified: each icon&rsquo;s background is removed and the
          shape is recoloured to this game&rsquo;s palette.
        </p>
        <p className="mt-3 max-w-prose text-sm text-text-muted">
          They are placeholders standing in for original artwork, and they
          carry no part of this world&rsquo;s identity.
        </p>
        <h3 className="mt-4 text-sm font-medium text-text">Icons by</h3>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {authors.map((author) => (
            <li key={author.name}>
              {author.url ? (
                <TextLink href={author.url}>{author.name}</TextLink>
              ) : (
                <span className="text-text-muted">{author.name}</span>
              )}
            </li>
          ))}
        </ul>
      </Surface>

      <Surface as="section" raised>
        <h2 className="font-display text-lg font-semibold text-text">
          Everything else
        </h2>
        <p className="mt-2 max-w-prose text-sm text-text-muted">
          The companions, the Hollow&rsquo;s painted grounds, the frames,
          backdrops, and painted terrain the silhouettes stand on, the
          palette, and all writing are original to this project.
        </p>
      </Surface>
    </>
  );
}
