/**
 * Offline content-validation rules (no database). Each test clones the
 * shipped content and mutates one aspect, so the rules are exercised
 * against realistic data without maintaining a parallel fixture world.
 */
import { describe, expect, it } from "vitest";
import { gameContent, type GameContent } from "../content";
import {
  ContentValidationError,
  countWordAnswers,
  requestBalanceReport,
  validateContent,
  validateRandomEvents,
  WORD_MIN_ACTIVE_ANSWERS,
} from "./validation";
import { RANDOM_EVENTS } from "../../src/server/modules/events/catalog";
import type { RandomEventDefinition } from "../../src/server/modules/events/types";

function cloneContent(): GameContent {
  // structuredClone preserves bigint prices and nested arrays.
  return structuredClone(gameContent) as GameContent;
}

function problemsOf(content: GameContent) {
  try {
    validateContent(content);
    return [];
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return error.problems;
    }
    throw error;
  }
}

describe("shipped content", () => {
  it("passes validation as authored", () => {
    expect(() => validateContent(cloneContent())).not.toThrow();
  });

  it("reports total and active word answers separately", () => {
    const content = cloneContent();
    const entries = content.daily.wordAnswers.EASY as unknown as (
      | string
      | { word: string; active: boolean }
    )[];
    const firstWord =
      typeof entries[0] === "string" ? entries[0] : entries[0]!.word;
    entries[0] = { word: firstWord, active: false };
    entries.push("ZYXW");
    const counts = countWordAnswers(content.daily.wordAnswers);
    expect(counts.EASY.total).toBe(101);
    expect(counts.EASY.active).toBe(100);
  });
});

describe("region-scoped location slugs", () => {
  it("rejects duplicate location slugs within the same region", () => {
    const content = cloneContent();
    const region = content.regions[0]!;
    const locations = region.locations as unknown as { slug: string }[];
    locations[1]!.slug = locations[0]!.slug;
    const problems = problemsOf(content);
    expect(
      problems.some(
        (p) =>
          p.message.includes("duplicate location slug within region") &&
          p.subject === `${region.slug}/${locations[0]!.slug}`,
      ),
    ).toBe(true);
  });

  it("allows different regions to reuse the same location slug", () => {
    const content = cloneContent();
    const source = content.regions[0]!;
    const reused = structuredClone(source.locations[0]!);
    const second = {
      ...structuredClone(source),
      slug: "second-region",
      name: "Second Region",
      locations: [reused],
    };
    (content.regions as unknown as unknown[]).push(second);
    const problems = problemsOf(content);
    expect(
      problems.filter((p) => p.message.includes("duplicate location slug")),
    ).toEqual([]);
  });

  it("rejects a shop whose location exists only in a different region", () => {
    const content = cloneContent();
    const shop = content.npcShops[0]! as unknown as { regionSlug: string };
    shop.regionSlug = "some-other-region";
    const problems = problemsOf(content);
    expect(
      problems.some(
        (p) =>
          p.domain === "npc-shops" &&
          p.message.includes("unknown location") &&
          p.message.includes("region + location slug"),
      ),
    ).toBe(true);
  });
});

describe("word answer capacity", () => {
  it("requires at least 100 configured entries per difficulty", () => {
    const content = cloneContent();
    (content.daily.wordAnswers.HARD as unknown as unknown[]).length = 99;
    const problems = problemsOf(content);
    // Schema floor (min 100) plus the active-capacity policy both flag it.
    expect(problems.some((p) => p.subject.startsWith("daily.wordAnswers.HARD"))).toBe(
      true,
    );
    expect(
      problems.some(
        (p) => p.domain === "daily-words" && p.subject === "HARD",
      ),
    ).toBe(true);
  });

  it("fails actionably when active answers drop below the policy floor", () => {
    const content = cloneContent();
    const entries = content.daily.wordAnswers.MEDIUM as unknown as (
      | string
      | { word: string; active: boolean }
    )[];
    const firstWord =
      typeof entries[0] === "string" ? entries[0] : entries[0]!.word;
    entries[0] = { word: firstWord, active: false };
    const problems = problemsOf(content);
    const problem = problems.find(
      (p) => p.domain === "daily-words" && p.subject === "MEDIUM",
    );
    expect(problem).toBeDefined();
    expect(problem?.message).toContain(`99 of 100`);
    expect(problem?.message).toContain(String(WORD_MIN_ACTIVE_ANSWERS));
    expect(problem?.message).toContain("append replacement words");
  });

  it("accepts more than 100 entries so words can be appended", () => {
    const content = cloneContent();
    (content.daily.wordAnswers.EASY as unknown as string[]).push("ZYXW");
    expect(problemsOf(content)).toEqual([]);
  });
});

describe("location activity attachments", () => {
  function activitiesOf(content: GameContent, slug: string) {
    const location = content.regions[0]!.locations.find((l) => l.slug === slug);
    if (!location) throw new Error(`no location ${slug}`);
    return (location.activities ??= []) as {
      type: string;
      activityKey: string;
      displayOrder: number;
      active?: boolean;
    }[];
  }

  it("rejects an unknown activity key", () => {
    const content = cloneContent();
    activitiesOf(content, "hearth-and-ladle")[1]!.activityKey = "no-such-board";
    const problems = problemsOf(content);
    expect(
      problems.some(
        (p) =>
          p.domain === "activities" &&
          p.message.includes('no request board with key "no-such-board"'),
      ),
    ).toBe(true);
  });

  it("rejects a duplicate attachment at one location", () => {
    const content = cloneContent();
    const activities = activitiesOf(content, "hearth-and-ladle");
    activities.push({ ...activities[0]!, displayOrder: 30 });
    const problems = problemsOf(content);
    expect(
      problems.some((p) =>
        p.message.includes("duplicate attachment (type + key) at a location"),
      ),
    ).toBe(true);
  });

  it("rejects two attachments sharing a display order", () => {
    const content = cloneContent();
    const activities = activitiesOf(content, "hearth-and-ladle");
    activities[1]!.displayOrder = activities[0]!.displayOrder;
    const problems = problemsOf(content);
    expect(
      problems.some((p) =>
        p.message.includes("duplicate display order at a location"),
      ),
    ).toBe(true);
  });

  it("rejects an NPC shop attached to a location it does not belong to", () => {
    const content = cloneContent();
    activitiesOf(content, "hearth-and-ladle").push({
      type: "NPC_SHOP",
      activityKey: content.npcShops[0]!.slug,
      displayOrder: 30,
      active: true,
    });
    const problems = problemsOf(content);
    expect(
      problems.some(
        (p) => p.domain === "activities" && p.message.includes("belongs to"),
      ),
    ).toBe(true);
  });

  it("rejects a daily attachment whose key is not its configuration", () => {
    const content = cloneContent();
    activitiesOf(content, "brassbell-pavilion")[0]!.activityKey = "some-other-wheel";
    const problems = problemsOf(content);
    expect(
      problems.some((p) => p.message.includes("no prize wheel with slug")),
    ).toBe(true);
  });

  it("rejects removing a daily anchor's attachment", () => {
    const content = cloneContent();
    activitiesOf(content, "whisperleaf-reading-room").length = 0;
    const problems = problemsOf(content);
    expect(
      problems.some((p) =>
        p.message.includes("expected an active DAILY_WORD attachment here"),
      ),
    ).toBe(true);
  });
});

describe("request board content", () => {
  it("rejects a duplicate sequence position", () => {
    const content = cloneContent();
    const requests = content.requestBoards[0]!.requests as unknown as {
      sequencePosition: number;
    }[];
    requests[1]!.sequencePosition = requests[0]!.sequencePosition;
    const problems = problemsOf(content);
    expect(
      problems.some((p) =>
        p.message.includes("duplicate sequence position within board"),
      ),
    ).toBe(true);
  });

  it("rejects an unknown requirement item", () => {
    const content = cloneContent();
    const requirements = content.requestBoards[0]!.requests[0]!
      .requirements as unknown as { itemSlug: string }[];
    requirements[0]!.itemSlug = "not-a-real-item";
    const problems = problemsOf(content);
    expect(
      problems.some((p) => p.message.includes('unknown item "not-a-real-item"')),
    ).toBe(true);
  });

  it("rejects a non-positive reward", () => {
    const content = cloneContent();
    (content.requestBoards[0]!.requests[0]! as unknown as {
      rewardCoins: bigint;
    }).rewardCoins = 0n;
    const problems = problemsOf(content);
    expect(problems.some((p) => p.domain === "requests")).toBe(true);
  });

  it("flags guaranteed arbitrage against NPC prices", () => {
    const content = cloneContent();
    // Swap in an NPC-purchasable item and pay more than it costs to buy.
    const request = content.requestBoards[0]!.requests[0]! as unknown as {
      requirements: { itemSlug: string; quantity: number }[];
      rewardCoins: bigint;
    };
    request.requirements = [{ itemSlug: "acorn-tea", quantity: 1 }];
    request.rewardCoins = 5_000n;
    const problems = problemsOf(content);
    expect(
      problems.some((p) => p.message.includes("guaranteed arbitrage")),
    ).toBe(true);
  });

  it("reports margins for the shipped board without arbitrage", () => {
    const rows = requestBalanceReport(cloneContent());
    expect(rows.length).toBeGreaterThanOrEqual(12);
    expect(rows.every((row) => !row.arbitrage)).toBe(true);
    expect(rows.every((row) => row.reward > 0n)).toBe(true);
  });
});

describe("starter pack", () => {
  it("rejects a starter pack item that is not ACTIVE", () => {
    const content = cloneContent();
    const item = content.items.find((i) => i.slug === "sunberry-cluster") as
      | undefined
      | { lifecycle?: string };
    if (item) item.lifecycle = "RETIRED";
    const problems = problemsOf(content);
    expect(
      problems.some((p) => p.domain === "starter-pack"),
    ).toBe(true);
  });
});

describe("random-event catalog", () => {
  const items = new Map<string, { slug: string; lifecycle?: string; stackable?: boolean }>([
    ["good-item", { slug: "good-item" }],
    ["retired-item", { slug: "retired-item", lifecycle: "RETIRED" }],
    ["instanced-item", { slug: "instanced-item", stackable: false }],
  ]);

  function event(
    overrides: Partial<RandomEventDefinition> & { key: string },
  ): RandomEventDefinition {
    return {
      title: "T",
      message: "M",
      weight: 10,
      enabled: true,
      category: "grove",
      rarity: "common",
      effects: [{ kind: "flavor" }],
      ...overrides,
    };
  }

  function messages(catalog: RandomEventDefinition[]): string[] {
    return validateRandomEvents(catalog, items).map((problem) => problem.message);
  }

  it("passes the shipped catalog against the shipped items", () => {
    // The real guard: every slug, route rule, and bound in what ships.
    const content = cloneContent();
    const shippedItems = new Map(
      content.items.map((item) => [item.slug, item as never]),
    );
    expect(validateRandomEvents(RANDOM_EVENTS, shippedItems)).toEqual([]);
  });

  it("rejects duplicate keys, which are permanent occurrence references", () => {
    expect(messages([event({ key: "same" }), event({ key: "same" })])).toContain(
      "duplicate event key — keys are permanent occurrence references",
    );
  });

  it("rejects non-positive weights and empty effect lists", () => {
    expect(messages([event({ key: "a", weight: 0 })])).toContain(
      "weight must be a positive finite number",
    );
    expect(messages([event({ key: "b", effects: [] })])[0]).toMatch(
      /at least one effect/,
    );
  });

  it("rejects item effects that cannot legally be granted", () => {
    expect(
      messages([event({ key: "a", effects: [{ kind: "item", slug: "nope" }] })]),
    ).toContain('unknown item "nope"');
    expect(
      messages([
        event({ key: "b", effects: [{ kind: "item", slug: "retired-item" }] }),
      ])[0],
    ).toMatch(/must be ACTIVE/);
    // One-of-a-kind objects deserve a story; a page load is not one.
    expect(
      messages([
        event({ key: "c", effects: [{ kind: "item", slug: "instanced-item" }] }),
      ])[0],
    ).toMatch(/instanced/);
  });

  it("refuses anything that could hurt a pet or the economy", () => {
    expect(
      messages([
        event({
          key: "a",
          eligibility: { requiresPet: true },
          effects: [{ kind: "petStat", stat: "health", delta: -5 }],
        }),
      ])[0],
    ).toMatch(/never reduce health/);

    expect(
      messages([
        event({
          key: "b",
          eligibility: { requiresPet: true },
          effects: [{ kind: "petStat", stat: "hunger", delta: -50 }],
        }),
      ])[0],
    ).toMatch(/outside the mild range/);

    expect(
      messages([event({ key: "c", effects: [{ kind: "coins", min: 1, max: 99_999 }] })])[0],
    ).toMatch(/exceeds the 500 ceiling/);

    expect(
      messages([event({ key: "d", effects: [{ kind: "coins", min: 10, max: 5 }] })])[0],
    ).toMatch(/must be positive and ordered/);
  });

  it("requires pet effects to declare the pet requirement", () => {
    expect(
      messages([
        event({ key: "a", effects: [{ kind: "petStat", stat: "hunger", delta: 5 }] }),
      ]),
    ).toContain("events with pet effects must declare eligibility.requiresPet");
  });

  it("rejects route rules outside the eligible routes", () => {
    expect(
      messages([event({ key: "a", eligibility: { routePrefixes: ["/sign-in"] } })])[0],
    ).toMatch(/outside the eligible routes/);
    expect(
      messages([event({ key: "b", eligibility: { routePrefixes: ["/market"] } })]),
    ).toEqual([]);
  });

  it("rejects a catalog with nothing enabled", () => {
    expect(messages([event({ key: "a", enabled: false })])).toContain(
      "no enabled events — every roll would find an empty pool",
    );
  });
});

describe("the Hollow", () => {
  function hollowProblems(mutate: (content: GameContent) => void) {
    const content = cloneContent();
    mutate(content);
    return problemsOf(content)
      .filter((problem) => problem.domain === "hollow" || problem.domain === "items")
      .map((problem) => problem.message);
  }

  it("refuses a furnishing that can also be got for free", () => {
    // This is the sink's integrity, and it is one careless content edit
    // away at all times: a furnishing in a forage pool or a request board
    // reward is a hole in the only mechanism that gives late coins a
    // reason to exist.
    const messages = hollowProblems((content) => {
      const furnishing = content.items.find(
        (item) => item.category === "furnishings",
      );
      const spot = content.forageSpots[0];
      if (furnishing && spot) {
        spot.entries.push({
          itemSlug: furnishing.slug,
          selectionWeight: 1,
          minQuantity: 1,
          maxQuantity: 1,
        });
      }
    });
    expect(messages.join("\n")).toMatch(/only from the Hollow catalogue/);
  });

  it("refuses a furnishing an NPC shop would price differently", () => {
    const messages = hollowProblems((content) => {
      const furnishing = content.items.find(
        (item) => item.category === "furnishings",
      );
      const shop = content.npcShops[0];
      if (furnishing && shop) {
        shop.pool.push({
          itemSlug: furnishing.slug,
          shopRarity: "COMMON",
          price: 1n,
          weight: 1,
          minQuantity: 1,
          maxQuantity: 1,
        });
      }
    });
    expect(messages.join("\n")).toMatch(/only from the Hollow catalogue/);
  });

  it("refuses a tradeable furnishing", () => {
    // A resale market recycles coins instead of destroying them, and
    // invites buying to speculate rather than because you liked the thing.
    const messages = hollowProblems((content) => {
      const furnishing = content.items.find(
        (item) => item.category === "furnishings",
      );
      if (furnishing) furnishing.tradeable = true;
    });
    expect(messages.join("\n")).toMatch(/must set tradeable: false/);
  });

  it("refuses a furnishing with a rarity tier", () => {
    // Rarity ranks, and a ranked catalogue quietly tells the player which
    // things are worth wanting.
    const messages = hollowProblems((content) => {
      const furnishing = content.items.find(
        (item) => item.category === "furnishings",
      );
      if (furnishing) furnishing.rarity = "ULTRA_RARE";
    });
    expect(messages.join("\n")).toMatch(/carry no rarity tier/);
  });

  it("requires exactly one centre in every ground", () => {
    const messages = hollowProblems((content) => {
      const ground = content.hollow.grounds[0];
      const centre = ground?.anchors.find((a) => a.maxSize === "CENTREPIECE");
      if (centre) centre.maxSize = "LARGE";
    });
    expect(messages.join("\n")).toMatch(/exactly one CENTREPIECE anchor/);
  });

  it("requires a price rung for every ground and a free first one", () => {
    expect(
      hollowProblems((content) => {
        content.hollow.groundPrices = content.hollow.groundPrices.slice(0, 2);
      }).join("\n"),
    ).toMatch(/no price for ground number/);

    expect(
      hollowProblems((content) => {
        const first = content.hollow.groundPrices.find((r) => r.order === 0);
        if (first) first.price = 500n;
      }).join("\n"),
    ).toMatch(/first ground must be free/);
  });

  it("requires exactly one free air", () => {
    expect(
      hollowProblems((content) => {
        for (const air of content.hollow.airs) air.price = 100n;
      }).join("\n"),
    ).toMatch(/exactly one air must be free/);
  });

  it("refuses a ground with a place nothing in the catalogue fits", () => {
    const messages = hollowProblems((content) => {
      content.items = content.items.filter(
        (item) => item.category !== "furnishings" || item.furnishing?.size !== "SMALL",
      );
    });
    // Every remaining size is larger than SMALL, so a SMALL-only place has
    // nothing that could ever stand in it.
    expect(messages.join("\n")).toMatch(/nothing in the catalogue fits/);
  });
});

describe("random events cover the world", () => {
  it("requires every region to have events of its own", () => {
    // A newer region should feel more alive than the one the player came
    // from, not less. Saltmere shipped with eight locations and no events
    // at all, which this rule now makes impossible to repeat.
    const content = cloneContent();
    content.regions = [
      ...content.regions,
      {
        ...(content.regions[0] as GameContent["regions"][number]),
        slug: "nowhere-in-particular",
        name: "Nowhere In Particular",
      },
    ];
    expect(problemsOf(content).map((p) => p.message).join("\n")).toMatch(
      /has no events of its own/,
    );
  });
});
