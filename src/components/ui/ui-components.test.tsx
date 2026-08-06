/**
 * Component contract tests, rendered with react-dom/server (no browser,
 * no extra dependencies): variants, semantics, accessible names, and
 * non-color state cues are asserted on the produced markup.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, buttonClasses, LinkButton } from "./button";
import { IconButton } from "./icon-button";
import { StatusBadge, type PlayerStatus } from "./status-badge";
import { InlineNotice } from "./inline-notice";
import { ArtworkFrame } from "./artwork-frame";
import { CurrencyAmount } from "./currency-amount";
import { ItemIdentity } from "./item-identity";
import { PetConditionMeter } from "../pet/pet-condition-meter";
import { describeStat } from "@/lib/pet-condition";
import {
  mealPanelStatus,
  wheelPanelStatus,
  wordPanelStatus,
} from "../daily/daily-status-presentation";
import {
  announceEvaluation,
  CELL_ICON,
  CELL_LABEL,
} from "../daily/word-game";

describe("Button", () => {
  it("renders each variant with distinct styling", () => {
    const variants = [
      "primary",
      "secondary",
      "quiet",
      "destructive",
      "destructiveQuiet",
    ] as const;
    const classes = variants.map((variant) => buttonClasses(variant));
    expect(new Set(classes).size).toBe(variants.length);
    for (const cls of classes) {
      expect(cls).toContain("min-h-11"); // touch target floor
      expect(cls).toContain("focus-visible:outline-2");
    }
  });

  it("renders disabled state and accessible content", () => {
    const html = renderToStaticMarkup(<Button disabled>Save</Button>);
    expect(html).toContain("disabled");
    expect(html).toContain("Save");
    expect(html).toContain('type="button"');
  });

  it("LinkButton renders an anchor with button styling", () => {
    const html = renderToStaticMarkup(
      <LinkButton href="/market" variant="quiet">
        Show more
      </LinkButton>,
    );
    expect(html).toContain("<a ");
    expect(html).toContain('href="/market"');
    expect(html).toContain("hover:bg-accent-soft");
  });
});

describe("IconButton", () => {
  it("always carries an accessible name and full touch target", () => {
    const html = renderToStaticMarkup(<IconButton label="Move up">↑</IconButton>);
    expect(html).toContain('aria-label="Move up"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("min-w-11");
    // The glyph itself is decorative.
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("StatusBadge", () => {
  const statuses: PlayerStatus[] = [
    "AVAILABLE",
    "IN_PROGRESS",
    "COMPLETED",
    "FAILED",
    "CLAIMED",
    "SOLD_OUT",
    "UNAVAILABLE",
  ];

  it("shows a player-facing label, never the raw enum", () => {
    for (const status of statuses) {
      const html = renderToStaticMarkup(<StatusBadge status={status} />);
      expect(html).not.toContain(status); // raw enum text never rendered
      expect(html).toContain('aria-hidden="true"'); // icon cue present
    }
    expect(renderToStaticMarkup(<StatusBadge status="IN_PROGRESS" />)).toContain(
      "In progress",
    );
    expect(renderToStaticMarkup(<StatusBadge status="SOLD_OUT" />)).toContain(
      "Sold out",
    );
  });

  it("supports domain copy overrides while keeping the shared icon", () => {
    const html = renderToStaticMarkup(
      <StatusBadge status="COMPLETED" label="Spun today" />,
    );
    expect(html).toContain("Spun today");
    expect(html).toContain("✓");
  });
});

describe("InlineNotice", () => {
  it("maps tones to appropriate live-region roles", () => {
    expect(
      renderToStaticMarkup(<InlineNotice tone="error">No.</InlineNotice>),
    ).toContain('role="alert"');
    expect(
      renderToStaticMarkup(<InlineNotice tone="success">Yes.</InlineNotice>),
    ).toContain('role="status"');
    // Informational copy is not announced.
    expect(
      renderToStaticMarkup(<InlineNotice tone="info">FYI.</InlineNotice>),
    ).not.toContain('role=');
  });

  it("pairs an icon with every tone so color is never alone", () => {
    for (const tone of ["info", "success", "warning", "error"] as const) {
      const html = renderToStaticMarkup(
        <InlineNotice tone={tone}>Message</InlineNotice>,
      );
      expect(html).toContain('aria-hidden="true"');
    }
  });
});

describe("ArtworkFrame", () => {
  it("reserves stable dimensions per aspect", () => {
    expect(
      renderToStaticMarkup(<ArtworkFrame aspect="square">x</ArtworkFrame>),
    ).toContain("aspect-square");
    expect(
      renderToStaticMarkup(<ArtworkFrame aspect="wide">x</ArtworkFrame>),
    ).toContain("aspect-video");
    expect(
      renderToStaticMarkup(<ArtworkFrame aspect="portrait">x</ArtworkFrame>),
    ).toContain("aspect-4/5");
  });

  it("supports focal positioning for future painted art", () => {
    const html = renderToStaticMarkup(
      <ArtworkFrame focal="top">x</ArtworkFrame>,
    );
    expect(html).toContain("object-top");
  });

  it("renders a quiet placeholder, never a broken-image look", () => {
    const html = renderToStaticMarkup(<ArtworkFrame />);
    expect(html).toContain("✦");
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("CurrencyAmount", () => {
  it("formats bigint amounts with grouping", () => {
    const html = renderToStaticMarkup(
      <CurrencyAmount amount={1234567890123n} />,
    );
    expect(html).toContain("1,234,567,890,123");
    expect(html).toContain("coins");
  });

  it("keeps explicit signs on deltas alongside color", () => {
    const positive = renderToStaticMarkup(
      <CurrencyAmount amount={25n} delta />,
    );
    expect(positive).toContain("+");
    expect(positive).toContain("text-success");
    const negative = renderToStaticMarkup(
      <CurrencyAmount amount={-25n} delta />,
    );
    expect(negative).toContain("−");
    expect(negative).toContain("text-danger");
    expect(negative).toContain("25");
  });

  it("compact mode drops the unit word only", () => {
    const html = renderToStaticMarkup(<CurrencyAmount amount={7n} compact />);
    expect(html).not.toContain("coins");
    expect(html).toContain("7");
  });
});

describe("ItemIdentity", () => {
  function render(extra: Record<string, unknown> = {}) {
    return renderToStaticMarkup(
      <ItemIdentity
        name="Unremarkable Acorn"
        art={<span>art</span>}
        rarity="COMMON"
        meta="5 in stock"
        price={<CurrencyAmount amount={5n} />}
        action={<button type="button">Buy</button>}
        {...extra}
      />,
    );
  }

  it("keeps rarity out of the name's line", () => {
    const html = render();
    // The heading closes before the rarity badge opens; sharing a wrapping
    // row with a long name split the two unpredictably.
    const headingEnd = html.indexOf("</h3>");
    const rarityAt = html.indexOf("Common");
    expect(headingEnd).toBeGreaterThan(-1);
    expect(rarityAt).toBeGreaterThan(headingEnd);
  });

  it("puts the action below the artwork row, not beside it", () => {
    const html = render();
    // The action must not sit in the text column: that made the column
    // taller than the artwork and left dead space under the art.
    const artRowEnd = html.lastIndexOf("</div></div>");
    expect(html.indexOf("Buy</button>")).toBeGreaterThan(artRowEnd);
  });

  it("omits the rarity line entirely when there is nothing to put in it", () => {
    const html = renderToStaticMarkup(
      <ItemIdentity name="Plain" art={<span>art</span>} />,
    );
    expect(html).not.toContain("Common");
    // No empty badge row left behind.
    expect(html).not.toContain("gap-y-1");
  });
});

describe("PetConditionMeter", () => {
  it("shows a named state and no numbers at all", () => {
    const html = renderToStaticMarkup(
      <PetConditionMeter condition={describeStat("hunger", 78)} />,
    );
    expect(html).toContain("Well fed");
    // Nothing numeric survives to the page — not the value, not a
    // percentage, not an "x/100".
    const visibleText = html.replace(/<[^>]*>/g, " ");
    expect(visibleText).not.toMatch(/\d/);
    expect(html).not.toContain("78");
  });

  it("announces the state rather than the band index", () => {
    const html = renderToStaticMarkup(
      <PetConditionMeter condition={describeStat("health", 12)} />,
    );
    // role=meter needs a numeric value; aria-valuetext is what is spoken.
    expect(html).toContain('role="meter"');
    expect(html).toMatch(/aria-valuetext="Poorly\./);
  });

  it("fills one more segment for a better state", () => {
    const fill = (value: number) =>
      renderToStaticMarkup(
        <PetConditionMeter condition={describeStat("energy", value)} />,
      ).split("bg-stat-energy").length - 1;
    expect(fill(95)).toBeGreaterThan(fill(5));
  });
});

describe("word tile presentation", () => {
  it("gives every evaluation state a non-color cue", () => {
    // Exact and present have icons; absent strikes the letter through.
    expect(CELL_ICON.E).not.toBe("");
    expect(CELL_ICON.P).not.toBe("");
    expect(CELL_LABEL.E).toBe("correct position");
    expect(CELL_LABEL.P).toBe("in the word, different position");
    expect(CELL_LABEL.A).toBe("not in the word");
  });

  it("announces evaluations letter by letter", () => {
    expect(announceEvaluation("MOSS", "EPAA")).toBe(
      "M correct position, O in the word, different position, S not in the word, S not in the word",
    );
  });
});

describe("daily activity state mapping", () => {
  it("maps word progress onto the shared vocabulary", () => {
    expect(wordPanelStatus(0)).toEqual({
      status: "AVAILABLE",
      label: "Available",
    });
    expect(wordPanelStatus(2)).toEqual({
      status: "IN_PROGRESS",
      label: "2/3 done",
    });
    expect(wordPanelStatus(3)).toEqual({
      status: "COMPLETED",
      label: "Done for today",
    });
  });

  it("maps wheel and meal states", () => {
    expect(wheelPanelStatus("AVAILABLE").status).toBe("AVAILABLE");
    expect(wheelPanelStatus("COMPLETED").label).toBe("Spun today");
    expect(mealPanelStatus("CLAIMED")).toEqual({
      status: "CLAIMED",
      label: "Claimed today",
    });
  });
});
