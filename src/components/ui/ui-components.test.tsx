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
import { Modal } from "./modal";
import { describeStat } from "@/lib/pet-condition";
import { FeedbackBanner, sanitizeFeedback } from "./feedback-banner";
import { ECONOMY_MESSAGES } from "@/server/modules/commerce/errors";
import { REQUEST_MESSAGES } from "@/server/modules/requests/errors";
import { GENERIC_ERROR_MESSAGE } from "@/server/errors";
import {
  activityPanelStatus,
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

  it("compact mode hides the unit visually but keeps it announced", () => {
    // The glyph is aria-hidden, so removing the word outright left a
    // screen reader announcing a bare number with no unit.
    const html = renderToStaticMarkup(<CurrencyAmount amount={7n} compact />);
    expect(html).toContain("7");
    expect(html).toContain("sr-only");
    expect(html).toContain("coins");
    expect(html).not.toContain('<span> coins</span>');
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

  it("places an inline action beside the price, in the row's dead space", () => {
    const html = renderToStaticMarkup(
      <ItemIdentity
        name="Mossberry Jam"
        art={<span>art</span>}
        price={<span>55 coins</span>}
        actionPlacement="inline"
        action={<button type="button">Buy</button>}
      />,
    );
    // Price and action share one flex row: the artwork already sets the
    // row height, so a lone button there costs nothing and saves a band.
    expect(html).toMatch(/55 coins<\/span><\/p><button/);
    // And the artwork gives up a little width to make room for it.
    expect(html).toContain("min-[360px]:w-24");
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

describe("Modal", () => {
  it("is a native dialog, so focus trapping and Escape come from the platform", () => {
    const html = renderToStaticMarkup(
      <Modal open onClose={() => {}} labelledBy="t">
        <h2 id="t">Titled</h2>
      </Modal>,
    );
    // A hand-rolled overlay has to reimplement all of this, and usually
    // gets background inertness wrong in a way screenshots never show.
    expect(html).toContain("<dialog");
    expect(html).toContain('aria-labelledby="t"');
    expect(html).toContain("backdrop:");
  });

  it("names itself from real content rather than a hardcoded label", () => {
    const html = renderToStaticMarkup(
      <Modal open onClose={() => {}} labelledBy="event-title">
        <h2 id="event-title">Loose change</h2>
      </Modal>,
    );
    expect(html).toContain('aria-labelledby="event-title"');
    expect(html).toContain("Loose change");
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
  // One mapping for every activity: the home dashboard and /games render
  // from the same function, so they cannot label an activity differently.
  it("maps each availability onto the shared vocabulary", () => {
    expect(activityPanelStatus({ kind: "AVAILABLE" })).toEqual({
      status: "AVAILABLE",
      label: "Available",
    });
    expect(
      activityPanelStatus({ kind: "IN_PROGRESS", done: 2, total: 3 }),
    ).toEqual({ status: "IN_PROGRESS", label: "2/3 done" });
    expect(activityPanelStatus({ kind: "DONE" })).toEqual({
      status: "COMPLETED",
      label: "Done for today",
    });
  });

  it("lets an activity name what the player did", () => {
    // "Spun today" beats a generic "Done for today", and the verb belongs
    // to the domain that knows it — one mapping, domain wording.
    expect(
      activityPanelStatus({ kind: "DONE", label: "Spun today" }),
    ).toEqual({ status: "COMPLETED", label: "Spun today" });
  });

  it("says an activity is closed rather than inviting a player into it", () => {
    // The bug this replaces: a dashboard row saying "Available" for a
    // wheel whose own page says "The wheel is resting today."
    expect(activityPanelStatus({ kind: "UNAVAILABLE" })).toEqual({
      status: "UNAVAILABLE",
      label: "Closed today",
    });
  });
});

describe("feedback banner sanitization", () => {
  it("passes the app's own messages through unchanged", () => {
    // Every player-facing message the domain layer can produce must
    // survive: a filter that eats real feedback is worse than the problem.
    const messages = [
      ...Object.values(ECONOMY_MESSAGES),
      ...Object.values(REQUEST_MESSAGES),
      GENERIC_ERROR_MESSAGE,
      "Yum! Honey Oat Loaf eaten. Well fed.",
      "Nib played with the Bounce Burr. In good spirits.",
      "Listed 3 × Sunberry Cluster at 40 coins each.",
      "Profile saved.",
    ];
    for (const message of messages) {
      expect(sanitizeFeedback(message)).toBe(message);
    }
  });

  it("refuses a message that names somewhere else to go", () => {
    // The primitive: an attacker-supplied link renders arbitrary text
    // inside the app's own trusted success/error chrome.
    for (const payload of [
      "Your account is locked. Verify at https://evil.example",
      "Verify at www.evil.example",
      "Email support@evil.example to unlock",
      "Go to evil.com now",
      "javascript:alert(1)",
    ]) {
      expect(sanitizeFeedback(payload)).toBeNull();
    }
  });

  it("refuses an over-long message and empty input", () => {
    expect(sanitizeFeedback("x".repeat(400))).toBeNull();
    expect(sanitizeFeedback("   ")).toBeNull();
    expect(sanitizeFeedback(undefined)).toBeNull();
  });

  it("collapses whitespace so a payload cannot lay itself out", () => {
    expect(sanitizeFeedback("Profile\n\n   saved.")).toBe("Profile saved.");
  });

  it("renders nothing at all when the message is refused", () => {
    const html = renderToStaticMarkup(
      <FeedbackBanner error="Verify at https://evil.example" />,
    );
    expect(html).toBe("");
  });
});
