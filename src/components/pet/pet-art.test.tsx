import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PetArt, MAX_SEASONS, seasonsSince } from "./pet-art";

/**
 * The art has to agree with what the meters say and with what each
 * species' own description promises. These are contract tests, not
 * pixel comparisons: they check that the picture changes at all, and that
 * it never changes for a reason the game is not allowed to have.
 */
const DAY = 86_400_000;

describe("seasonsSince", () => {
  it("counts whole seasons and never goes backwards or off the end", () => {
    const adopted = new Date("2026-01-01T00:00:00Z");
    expect(seasonsSince(adopted, adopted)).toBe(0);
    expect(seasonsSince(adopted, new Date(adopted.getTime() + 29 * DAY))).toBe(0);
    expect(seasonsSince(adopted, new Date(adopted.getTime() + 30 * DAY))).toBe(1);
    expect(seasonsSince(adopted, new Date(adopted.getTime() + 95 * DAY))).toBe(3);
    // Beyond the cap the picture settles; the record does not.
    expect(
      seasonsSince(adopted, new Date(adopted.getTime() + 10_000 * DAY)),
    ).toBe(MAX_SEASONS);
    // A clock skew must never produce a negative companion.
    expect(seasonsSince(adopted, new Date(adopted.getTime() - 40 * DAY))).toBe(0);
  });
});

describe("PetArt", () => {
  const render = (props: Parameters<typeof PetArt>[0]) =>
    renderToStaticMarkup(<PetArt {...props} />);

  it("shows spirits, because every species description promises it does", () => {
    const low = render({ artKey: "cindertail", label: "", mood: 0 });
    const high = render({ artKey: "cindertail", label: "", mood: 4 });
    expect(low).not.toBe(high);
  });

  it("changes with the seasons, and stops changing after the cap", () => {
    const fresh = render({ artKey: "thornbud", label: "", seasons: 0 });
    const older = render({ artKey: "thornbud", label: "", seasons: 4 });
    expect(fresh).not.toBe(older);
    expect(render({ artKey: "thornbud", label: "", seasons: MAX_SEASONS })).toBe(
      render({ artKey: "thornbud", label: "", seasons: MAX_SEASONS + 50 }),
    );
  });

  it("defaults to a neutral companion, so a stranger's is never read off a face", () => {
    expect(render({ artKey: "mistfin", label: "" })).toBe(
      render({ artKey: "mistfin", label: "", mood: 3, seasons: 0 }),
    );
  });

  it("keeps its accessible name, and hides itself when decorative", () => {
    expect(render({ artKey: "cindertail", label: "Ember, a Cindertail" })).toContain(
      'aria-label="Ember, a Cindertail"',
    );
    expect(render({ artKey: "cindertail", label: "" })).toContain('aria-hidden="true"');
  });

  it("falls back rather than rendering nothing for an unknown species", () => {
    expect(render({ artKey: "not-a-species", label: "" })).toContain("<svg");
  });
});
