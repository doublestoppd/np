import type { HollowSceneView } from "@/server/modules/hollow/queries";
import { GROWTH_STAGES } from "@/server/modules/hollow/config";
import { FurnishingArt, GroundArt } from "@/components/art/hollow-art";

/**
 * How wide a furnishing is drawn, as a percentage of the frame.
 *
 * Sized up from a first pass that looked right in the abstract and read as
 * an empty field on a phone: a 16:9 frame at 360px is about 150px tall, so
 * an 11% object is 40px of grey and the picture looks unfurnished no
 * matter how much is standing in it.
 */
const WIDTHS: Record<string, number> = {
  SMALL: 17,
  MEDIUM: 25,
  LARGE: 33,
  CENTREPIECE: 40,
};

/**
 * Describes an arrangement in words, back to front — the same order a
 * sighted visitor's eye travels.
 *
 * This is the whole accessibility argument for anchors over a drag canvas:
 * because the arrangement is structured data rather than pixels, a blind
 * visitor gets the same information in the same order, and it costs one
 * function. Empty places are named too, because "the far path is empty" is
 * part of how a place looks.
 */
export function describeScene(scene: HollowSceneView): string {
  const standing = scene.anchors
    .filter((anchor) => anchor.standing !== null)
    .map((anchor) => {
      const item = anchor.standing;
      if (!item) return "";
      const growing = item.growing ? ", still growing" : "";
      return `${anchor.label}: ${item.name}${growing}.`;
    })
    .filter(Boolean);
  const empty = scene.anchors.filter((anchor) => anchor.standing === null);

  const opening = `${scene.groundName}, under ${scene.airName}.`;
  if (standing.length === 0) {
    return `${opening} Nothing is standing here yet.`;
  }
  const closing =
    empty.length === 0
      ? "Every place is taken."
      : empty.length === 1
        ? `${empty[0]?.label} is empty.`
        : `${empty.length} places are empty.`;
  return `${opening} ${standing.join(" ")} ${closing}`;
}

/**
 * The picture. Furnishings are positioned at percentage coordinates and
 * painted back to front, so the composition holds at any width without a
 * single layout calculation — and there are no pixel coordinates coming
 * from a client for the server to have to distrust.
 */
export function HollowSceneArt({
  scene,
  aspect = "video",
}: {
  scene: HollowSceneView;
  /**
   * "video" is the compact 16:9 used in lists. "wide" is taller and is
   * what the Hollow's own page uses: a playtester pointed out that the
   * thing they were saving 145 days for rendered smaller than the button
   * underneath it, which is a strange way to sell somebody a picture.
   */
  aspect?: "video" | "wide";
}) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-surface border border-border ${
        aspect === "wide" ? "aspect-4/3 sm:aspect-video" : "aspect-video"
      }`}
    >
      <GroundArt
        artKey={scene.artKey}
        airKey={scene.airKey}
        label=""
        className="absolute inset-0 h-full w-full"
      />
      {scene.anchors.map((anchor) => {
        const item = anchor.standing;
        if (!item) return null;
        const width = WIDTHS[item.size] ?? WIDTHS.SMALL ?? 11;
        return (
          <div
            key={anchor.key}
            className="absolute"
            style={{
              left: `${anchor.x}%`,
              top: `${anchor.y}%`,
              width: `${width}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <FurnishingArt
              artKey={item.artKey}
              size={item.size}
              stage={item.stage}
              stages={GROWTH_STAGES}
              label=""
              className="h-full w-full"
            />
          </div>
        );
      })}
      {/* One description for the whole arrangement, rather than eight
          separate images a screen reader would read as a list of nouns. */}
      <span className="sr-only">{describeScene(scene)}</span>
    </div>
  );
}
