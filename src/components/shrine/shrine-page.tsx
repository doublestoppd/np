import type { ShrineTheme } from "@prisma/client";
import {
  counterDigits,
  parseStickers,
  themeStyle,
  THEMES,
} from "@/lib/shrine/themes";

/**
 * A player's Shrine, rendered (ADR-69).
 *
 * **Deliberately hideous, and deliberately sealed in.** Every colour, tile
 * and typeface arrives as a CSS custom property on the single wrapper
 * below; nothing here uses the app's design tokens and nothing here escapes
 * to touch them. The game keeps its restrained storybook look everywhere
 * else, and this one page gets to be 1999.
 *
 * Nothing a player wrote is markup. `banner` and `body` are strings, React
 * escapes them, and the only structure the body gets is a split on blank
 * lines into paragraphs. There is no dangerouslySetInnerHTML in this file
 * and there must never be one.
 */

export interface ShrineView {
  theme: ShrineTheme;
  banner: string;
  blink: boolean;
  body: string;
  stickers: string;
  visits: number;
  keeper: string;
}

/** Paragraphs, from blank lines. The only formatting there is. */
function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function ShrinePage({
  shrine,
  children,
}: {
  shrine: ShrineView;
  /** The guestbook, which needs interactivity the rest of this does not. */
  children?: React.ReactNode;
}) {
  const spec = THEMES[shrine.theme];
  const stickers = parseStickers(shrine.stickers);
  const lines = paragraphs(shrine.body);

  return (
    <div className="shrine" style={themeStyle(shrine.theme)}>
      {shrine.banner && (
        <div className="shrine-banner">
          {/*
            The marquee. A CSS translation rather than the `<marquee>` tag,
            which is obsolete and was never in any specification anybody
            agreed to — the joke survives, the deprecated element does not.
          */}
          <span
            className={`shrine-marquee${shrine.blink ? " shrine-blink" : ""}`}
          >
            {shrine.banner}
          </span>
        </div>
      )}

      <div className="shrine-panel">
        <h1 className="shrine-heading">{shrine.keeper}&apos;s shrine</h1>

        {lines.length > 0 ? (
          lines.map((line, index) => (
            <p key={index} className="shrine-para">
              {line}
            </p>
          ))
        ) : (
          <p className="shrine-para shrine-quiet">
            This page is under construction. It always will be.
          </p>
        )}

        {stickers.length > 0 && (
          <ul className="shrine-stickers">
            {stickers.map((sticker) => (
              <li key={sticker.key} className="shrine-sticker">
                <span aria-hidden="true">{sticker.face}</span> {sticker.label}
              </li>
            ))}
          </ul>
        )}

        {/*
          The counter. One per visitor per day rather than per page load,
          so it climbs honestly — the odometer is the joke, the inflation
          was never the fun part.
        */}
        <div className="shrine-counter">
          <span className="shrine-counter-label">You are visitor number</span>
          <span className="shrine-odometer">
            {counterDigits(shrine.visits).map((digit, index) => (
              <span key={index} className="shrine-digit">
                {digit}
              </span>
            ))}
          </span>
        </div>
      </div>

      {children}

      <p className="shrine-footer">
        Best viewed with your eyes. Theme: {spec.name}.
      </p>
    </div>
  );
}
