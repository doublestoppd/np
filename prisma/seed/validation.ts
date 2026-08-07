/**
 * Offline content validation (no database connection). Zod-validates each
 * domain, then cross-checks references, uniqueness, ranges, and
 * eligibility rules. All problems are aggregated into one report.
 */
import type { z } from "zod";
import { gameContent, type GameContent } from "../content";
import {
  dailyContentSchema,
  itemCategorySchema,
  itemSchema,
  itemTagSchema,
  FURNISHING_CATEGORY,
  hollowAirSchema,
  hollowGroundPriceSchema,
  hollowGroundSchema,
  npcShopSchema,
  regionSchema,
  requestBoardSchema,
  speciesSchema,
  upgradeTierSchema,
} from "../content/schemas";
import { WHEEL_TOTAL_WEIGHT } from "@/server/modules/daily/wheel/spin";
import { SORTING_BENCH_ACTIVITY_KEY } from "@/server/modules/games/sorting/config";
import { GIVEAWAY_ACTIVITY_KEY } from "@/server/modules/giveaway/config";
import { LANTERN_ACTIVITY_KEY } from "@/server/modules/daily/lantern/config";
import {
  DAILY_REGION_SLUG,
  MEAL_LOCATION_SLUG,
  WHEEL_LOCATION_SLUG,
  WORD_LOCATION_SLUG,
} from "../../src/server/modules/daily/locations";
import { DAILY_WORD_ACTIVITY_KEY } from "../../src/server/modules/daily/word/config";
import { STARTER_PACK_SLUGS } from "../../src/server/modules/pets/starter-pack";
import { OPENING_FURNISHINGS } from "../../src/server/modules/hollow/commands";
import {
  MIN_FOODS_PER_TASTE,
  MIN_TOYS_PER_TASTE,
  PALATE_FOOD_TAGS,
  PALATE_TOY_TAGS,
} from "../../src/server/modules/pets/palate";
import { RANDOM_EVENTS } from "../../src/server/modules/events/catalog";
import type { RandomEventDefinition } from "../../src/server/modules/events/types";
import {
  ELIGIBLE_ROUTE_PREFIXES,
  EXCLUDED_ROUTE_PREFIXES,
  isEligibleRoute,
} from "../../src/server/modules/events/routes";

export interface ContentProblem {
  domain: string;
  subject: string;
  message: string;
}

export class ContentValidationError extends Error {
  constructor(public readonly problems: ContentProblem[]) {
    super(`content validation failed with ${problems.length} problem(s)`);
    this.name = "ContentValidationError";
  }
}

const WORD_LENGTHS = { EASY: 4, MEDIUM: 5, HARD: 6 } as const;
/** One definition, owned by the domain that spins the wheel. */
export { WHEEL_TOTAL_WEIGHT };

/**
 * Project policy: each difficulty must keep at least 100 ACTIVE answers so
 * a rotation always covers 100 game days. Deactivating a word without
 * appending a replacement is a content error, not a silent shrink.
 */
export const WORD_MIN_ACTIVE_ANSWERS = 100;

export interface WordAnswerCounts {
  total: number;
  active: number;
}

/** Total vs active entries per difficulty — reported separately. */
export function countWordAnswers(
  wordAnswers: GameContent["daily"]["wordAnswers"],
): Record<keyof typeof WORD_LENGTHS, WordAnswerCounts> {
  const counts = {} as Record<keyof typeof WORD_LENGTHS, WordAnswerCounts>;
  for (const difficulty of Object.keys(WORD_LENGTHS) as (keyof typeof WORD_LENGTHS)[]) {
    const entries = wordAnswers[difficulty];
    const active = entries.filter(
      (entry) => typeof entry === "string" || entry.active,
    ).length;
    counts[difficulty] = { total: entries.length, active };
  }
  return counts;
}

function checkUnique(
  problems: ContentProblem[],
  domain: string,
  keys: string[],
  what = "slug",
): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      problems.push({ domain, subject: key, message: `duplicate ${what}` });
    }
    seen.add(key);
  }
}

function zodParse<T extends z.ZodType>(
  problems: ContentProblem[],
  domain: string,
  schema: T,
  value: unknown,
  subject: string,
): void {
  const result = schema.safeParse(value);
  if (!result.success) {
    for (const issue of result.error.issues) {
      problems.push({
        domain,
        subject: issue.path.length > 0 ? `${subject}.${issue.path.join(".")}` : subject,
        message: issue.message,
      });
    }
  }
}


export interface RequestBalanceRow {
  board: string;
  request: string;
  requirements: string;
  /** Sum of reference item values consumed. */
  referenceValue: bigint;
  /** Cheapest NPC cost to buy the requirements, when all are purchasable. */
  npcCost: bigint | null;
  reward: bigint;
  /** reward − referenceValue. */
  grossMargin: bigint;
  /** Reward exceeds what the items cost to buy from an NPC: free money. */
  arbitrage: boolean;
}

/**
 * Per-request economy report. Rewards are never rewritten automatically —
 * this surfaces the numbers (and flags guaranteed arbitrage) so an author
 * decides.
 */
export function requestBalanceReport(content: GameContent): RequestBalanceRow[] {
  const itemBySlug = new Map(content.items.map((item) => [item.slug, item]));
  // Cheapest NPC price per item across all shop pools.
  const npcPrice = new Map<string, bigint>();
  for (const shop of content.npcShops) {
    for (const entry of shop.pool) {
      const current = npcPrice.get(entry.itemSlug);
      if (current === undefined || entry.price < current) {
        npcPrice.set(entry.itemSlug, entry.price);
      }
    }
  }

  const rows: RequestBalanceRow[] = [];
  for (const board of content.requestBoards) {
    for (const request of board.requests) {
      let referenceValue = 0n;
      let npcCost: bigint | null = 0n;
      const parts: string[] = [];
      for (const requirement of request.requirements) {
        const item = itemBySlug.get(requirement.itemSlug);
        const quantity = BigInt(requirement.quantity);
        parts.push(`${requirement.quantity}x ${requirement.itemSlug}`);
        if (!item) {
          npcCost = null;
          continue;
        }
        referenceValue += item.price * quantity;
        const shopPrice = npcPrice.get(requirement.itemSlug);
        if (shopPrice === undefined) {
          // Not purchasable from any NPC — no arbitrage route exists.
          npcCost = null;
        } else if (npcCost !== null) {
          npcCost += shopPrice * quantity;
        }
      }
      rows.push({
        board: board.key,
        request: request.slug,
        requirements: parts.join(" + "),
        referenceValue,
        npcCost,
        reward: request.rewardCoins,
        grossMargin: request.rewardCoins - referenceValue,
        arbitrage: npcCost !== null && request.rewardCoins > npcCost,
      });
    }
  }
  return rows;
}

/** Validates the shipped content; throws ContentValidationError listing ALL problems. */
export function validateAllContent(): GameContent {
  return validateContent(gameContent);
}

/** Validates any content object — exported so tests can exercise the rules. */
type ValidatedItem = { slug: string; lifecycle?: string; stackable?: boolean };

/**
 * Random-event catalog rules. The catalog is code rather than seeded rows,
 * but it references item slugs and routes exactly like seeded content
 * does — so it is checked here, beside everything else that can go stale,
 * instead of being discovered at 3am. Exported so the rules can be tested
 * against crafted catalogs rather than only the shipped one.
 */
export function validateRandomEvents(
  catalog: readonly RandomEventDefinition[],
  itemBySlug: Map<string, ValidatedItem>,
): ContentProblem[] {
  const problems: ContentProblem[] = [];
  //
  // The catalog is code, not seeded rows, but it references item slugs and
  // routes exactly like seeded content does — so it is validated here, next
  // to everything else that can go stale, rather than discovered at 3am.
  const seenEventKeys = new Set<string>();
  for (const event of catalog) {
    const subject = event.key;
    if (seenEventKeys.has(event.key)) {
      problems.push({
        domain: "random-events",
        subject,
        message: "duplicate event key — keys are permanent occurrence references",
      });
    }
    seenEventKeys.add(event.key);

    if (!/^[a-z0-9-]+$/.test(event.key)) {
      problems.push({
        domain: "random-events",
        subject,
        message: "event key must be lowercase kebab-case",
      });
    }
    if (!Number.isFinite(event.weight) || event.weight <= 0) {
      problems.push({
        domain: "random-events",
        subject,
        message: "weight must be a positive finite number",
      });
    }
    if (event.effects.length === 0) {
      problems.push({
        domain: "random-events",
        subject,
        message: "event must declare at least one effect (use { kind: \"flavor\" })",
      });
    }
    if (event.title.trim() === "" || event.message.trim() === "") {
      problems.push({
        domain: "random-events",
        subject,
        message: "title and message must not be empty",
      });
    }

    for (const prefix of event.eligibility?.routePrefixes ?? []) {
      if (!isEligibleRoute(prefix)) {
        problems.push({
          domain: "random-events",
          subject,
          message: `route rule "${prefix}" is outside the eligible routes (allowed: ${ELIGIBLE_ROUTE_PREFIXES.join(", ")}; excluded: ${EXCLUDED_ROUTE_PREFIXES.join(", ")})`,
        });
      }
    }

    let requiresPet = false;
    for (const effect of event.effects) {
      if (effect.kind === "coins") {
        if (effect.min <= 0 || effect.max < effect.min) {
          problems.push({
            domain: "random-events",
            subject,
            message: `coin range ${effect.min}-${effect.max} must be positive and ordered`,
          });
        }
        // Keeps a single lucky page view from outpaying a day of play.
        if (effect.max > 500) {
          problems.push({
            domain: "random-events",
            subject,
            message: `coin reward ${effect.max} exceeds the 500 ceiling for page-view events`,
          });
        }
      }
      if (effect.kind === "item") {
        const item = itemBySlug.get(effect.slug);
        if (!item) {
          problems.push({
            domain: "random-events",
            subject,
            message: `unknown item "${effect.slug}"`,
          });
          continue;
        }
        if ((item.lifecycle ?? "ACTIVE") !== "ACTIVE") {
          problems.push({
            domain: "random-events",
            subject,
            message: `item "${effect.slug}" must be ACTIVE to be granted (got ${item.lifecycle})`,
          });
        }
        if ((effect.quantity ?? 1) <= 0) {
          problems.push({
            domain: "random-events",
            subject,
            message: `item "${effect.slug}" quantity must be positive`,
          });
        }
        // Instanced, provenance-bearing objects are one of a kind and
        // deserve a story about where they came from. "You loaded a page"
        // is not that story (docs/content-model.md).
        if (!(item.stackable ?? true)) {
          problems.push({
            domain: "random-events",
            subject,
            message: `item "${effect.slug}" is instanced — random events grant stackable items only`,
          });
        }
      }
      if (effect.kind === "petStat") {
        requiresPet = true;
        if (effect.stat === "health" && effect.delta < 0) {
          problems.push({
            domain: "random-events",
            subject,
            message: "random events must never reduce health — pets cannot die (CLAUDE.md)",
          });
        }
        if (effect.delta < -10 || effect.delta > 25 || effect.delta === 0) {
          problems.push({
            domain: "random-events",
            subject,
            message: `stat delta ${effect.delta} is outside the mild range (-10..25, non-zero)`,
          });
        }
      }
    }
    if (requiresPet && !event.eligibility?.requiresPet) {
      problems.push({
        domain: "random-events",
        subject,
        message: "events with pet effects must declare eligibility.requiresPet",
      });
    }
  }
  if (catalog.filter((event) => event.enabled).length === 0) {
    problems.push({
      domain: "random-events",
      subject: "catalog",
      message: "no enabled events — every roll would find an empty pool",
    });
  }


  return problems;
}

/**
 * The Hollow's content invariants.
 *
 * Most of these protect the sink's integrity rather than the schema's. A
 * furnishing that can be won, foraged, or bought elsewhere is a hole in
 * the only mechanism that gives late-game coins a reason to exist, and it
 * would be introduced by a one-line content edit that looks harmless.
 */
export function validateHollow(
  content: GameContent,
  itemBySlug: Map<string, GameContent["items"][number]>,
): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const push = (subject: string, message: string) =>
    problems.push({ domain: "hollow", subject, message });

  const { grounds, groundPrices, airs } = content.hollow;
  for (const ground of grounds) {
    zodParse(problems, "hollow", hollowGroundSchema, ground, ground.key);
  }
  for (const air of airs) {
    zodParse(problems, "hollow", hollowAirSchema, air, air.key);
  }
  for (const rung of groundPrices) {
    zodParse(
      problems,
      "hollow",
      hollowGroundPriceSchema,
      rung,
      `ground-price-${rung.order}`,
    );
  }
  checkUnique(problems, "hollow", grounds.map((g) => g.key), "ground key");
  checkUnique(problems, "hollow", airs.map((a) => a.key), "air key");
  checkUnique(
    problems,
    "hollow",
    groundPrices.map((rung) => String(rung.order)),
    "ground price order",
  );

  // The ladder is indexed by how many grounds you already hold, so it needs
  // exactly one rung per ground — a missing rung would make a ground
  // unbuyable, and a spare one would price a ground that does not exist.
  const orders = new Set(groundPrices.map((rung) => rung.order));
  for (let order = 0; order < grounds.length; order++) {
    if (!orders.has(order)) {
      push("ground-prices", `no price for ground number ${order + 1}`);
    }
  }
  for (const rung of groundPrices) {
    if (rung.order >= grounds.length) {
      push(
        "ground-prices",
        `rung ${rung.order} prices a ground that does not exist`,
      );
    }
  }
  // A Hollow is somewhere you already live, not something you unlock.
  const first = groundPrices.find((rung) => rung.order === 0);
  if (first && first.price !== 0n) {
    push("ground-prices", "the first ground must be free");
  }
  // Likewise a ground with no light is not a picture.
  const freeAirs = airs.filter((air) => air.price === 0n);
  if (freeAirs.length !== 1) {
    push(
      "airs",
      `exactly one air must be free (found ${freeAirs.length})`,
    );
  }

  const furnishings = content.items.filter(
    (item) => item.category === FURNISHING_CATEGORY,
  );
  if (furnishings.length === 0) {
    push("furnishings", "the catalogue is empty — grounds would be unfillable");
  }

  // Every anchor size that exists in a ground needs something that fits it,
  // or a place in the picture can never be filled by anybody.
  const sizesOffered = new Set(
    furnishings.map((item) => item.furnishing?.size).filter(Boolean),
  );
  const ORDERED_SIZES = ["SMALL", "MEDIUM", "LARGE", "CENTREPIECE"] as const;
  for (const ground of grounds) {
    for (const anchor of ground.anchors) {
      const fits = ORDERED_SIZES.slice(
        0,
        ORDERED_SIZES.indexOf(anchor.maxSize) + 1,
      );
      if (!fits.some((size) => sizesOffered.has(size))) {
        push(
          ground.key,
          `nothing in the catalogue fits "${anchor.key}" (max ${anchor.maxSize})`,
        );
      }
    }
  }

  // Every ground has exactly one centre, and a player who holds them all
  // should be able to give each a different one — otherwise the last
  // ground they buy is condemned to a duplicate of a picture they already
  // have, which is the opposite of what buying it was for.
  const centrepieces = furnishings.filter(
    (item) => item.furnishing?.size === "CENTREPIECE",
  ).length;
  if (centrepieces < grounds.length) {
    push(
      "furnishings",
      `${centrepieces} centrepiece(s) for ${grounds.length} grounds — a player holding every ground could not give each its own`,
    );
  }

  // Furnishings are sold by the Hollow's catalogue at Item.price and by
  // nothing else. A second source would either hand them out free — which
  // is a hole in the sink — or price the same object two ways.
  const otherSources = new Map<string, string>();
  const note = (slug: string, where: string) => {
    if (!otherSources.has(slug)) otherSources.set(slug, where);
  };
  for (const shop of content.npcShops) {
    for (const entry of shop.pool) note(entry.itemSlug, `shop "${shop.slug}"`);
  }
  for (const pool of content.daily.wheel.pools) {
    for (const entry of pool.entries) note(entry.itemSlug, "the prize wheel");
  }
  for (const entry of content.daily.meal.entries) {
    note(entry.itemSlug, "the community meal");
  }
  for (const spot of content.forageSpots) {
    for (const entry of spot.entries) note(entry.itemSlug, `forage spot "${spot.slug}"`);
  }
  for (const board of content.requestBoards) {
    for (const request of board.requests) {
      for (const requirement of request.requirements) {
        note(requirement.itemSlug, `request board "${board.key}"`);
      }
    }
  }
  for (const slug of STARTER_PACK_SLUGS) {
    note(slug, "the starter pack");
  }
  // The event catalog is code rather than seeded content, but it grants
  // items, so it is exactly as capable of putting a hole in the sink.
  for (const event of RANDOM_EVENTS) {
    for (const effect of event.effects) {
      if (effect.kind === "item") {
        note(effect.slug, `the random event "${event.key}"`);
      }
    }
  }
  for (const item of furnishings) {
    const where = otherSources.get(item.slug);
    if (where !== undefined) {
      push(
        item.slug,
        `a furnishing must come only from the Hollow catalogue, but this one also comes from ${where}`,
      );
    }
    if (item.price <= 0n) {
      push(item.slug, "a furnishing must cost something");
    }
  }

  // Referenced but unpriced art or unknown items would seed a broken
  // catalogue; the item schema has already checked shape, so this is only
  // about the join back to the item table.
  for (const item of furnishings) {
    if (!itemBySlug.has(item.slug)) {
      push(item.slug, "furnishing is not in the item catalogue");
    }
  }

  // The pieces a new Hollow opens with are named in domain code, and a
  // rename would silently open every future Hollow with a gap instead —
  // nothing would fail, and nobody would notice for months.
  for (const slug of OPENING_FURNISHINGS) {
    const item = itemBySlug.get(slug);
    if (!item) {
      push(slug, "opening furnishing does not exist");
      continue;
    }
    if (item.category !== FURNISHING_CATEGORY) {
      push(slug, "opening furnishing is not a furnishing");
    }
    if ((item.lifecycle ?? "ACTIVE") !== "ACTIVE") {
      push(slug, `opening furnishing must be ACTIVE (got ${item.lifecycle})`);
    }
    if (item.furnishing?.size !== "SMALL") {
      push(
        slug,
        "opening furnishings are placed at the small anchors of the first ground, so they must be SMALL",
      );
    }
  }

  return problems;
}

export function validateContent(content: GameContent): GameContent {
  const problems: ContentProblem[] = [];

  // ---- Schema shape per domain --------------------------------------
  for (const species of content.species) {
    zodParse(problems, "species", speciesSchema, species, species.slug);
  }
  for (const category of content.categories) {
    zodParse(problems, "categories", itemCategorySchema, category, category.slug);
  }
  for (const tag of content.tags) {
    zodParse(problems, "tags", itemTagSchema, tag, tag.slug);
  }
  for (const item of content.items) {
    zodParse(problems, "items", itemSchema, item, item.slug);
  }
  for (const region of content.regions) {
    zodParse(problems, "world", regionSchema, region, region.slug);
  }
  for (const shop of content.npcShops) {
    zodParse(problems, "npc-shops", npcShopSchema, shop, shop.slug);
  }
  for (const tier of content.upgradeTiers) {
    zodParse(problems, "upgrade-tiers", upgradeTierSchema, tier, `tier-${tier.tier}`);
  }
  zodParse(problems, "daily", dailyContentSchema, content.daily, "daily");
  for (const board of content.requestBoards) {
    zodParse(problems, "requests", requestBoardSchema, board, board.key);
  }

  // ---- Uniqueness ----------------------------------------------------
  checkUnique(problems, "species", content.species.map((s) => s.slug));
  checkUnique(problems, "categories", content.categories.map((c) => c.slug));
  checkUnique(problems, "tags", content.tags.map((t) => t.slug));
  checkUnique(problems, "items", content.items.map((i) => i.slug));
  checkUnique(problems, "world", content.regions.map((r) => r.slug));
  // Location slugs are unique WITHIN a region only; different regions may
  // reuse the same local slug (routes and references always carry the
  // region), matching the @@unique([regionId, slug]) database constraint.
  for (const region of content.regions) {
    checkUnique(
      problems,
      "world",
      region.locations.map((l) => `${region.slug}/${l.slug}`),
      "location slug within region",
    );
  }
  checkUnique(problems, "npc-shops", content.npcShops.map((s) => s.slug));
  checkUnique(
    problems,
    "upgrade-tiers",
    content.upgradeTiers.map((t) => String(t.tier)),
    "tier number",
  );
  checkUnique(
    problems,
    "daily",
    content.daily.wheel.pools.map((p) => p.slug),
    "wheel pool slug",
  );

  // ---- Reference maps ------------------------------------------------
  const itemBySlug = new Map(content.items.map((item) => [item.slug, item]));
  const categorySlugs = new Set(content.categories.map((c) => c.slug));
  const tagSlugs = new Set(content.tags.map((t) => t.slug));
  // Region-qualified location addresses ("region/location") — the only
  // form a content reference may use, since bare location slugs can
  // collide across regions.
  const locationSet = new Set(
    content.regions.flatMap((r) => r.locations.map((l) => `${r.slug}/${l.slug}`)),
  );

  // ---- Items: category and tag references ---------------------------
  for (const item of content.items) {
    if (!categorySlugs.has(item.category)) {
      problems.push({
        domain: "items",
        subject: item.slug,
        message: `unknown category "${item.category}"`,
      });
    }
    for (const tag of item.tags) {
      if (!tagSlugs.has(tag)) {
        problems.push({
          domain: "items",
          subject: item.slug,
          message: `unknown tag "${tag}"`,
        });
      }
    }
  }

  // ---- NPC shops -----------------------------------------------------
  for (const shop of content.npcShops) {
    if (!locationSet.has(`${shop.regionSlug}/${shop.locationSlug}`)) {
      problems.push({
        domain: "npc-shops",
        subject: shop.slug,
        message: `unknown location "${shop.regionSlug}/${shop.locationSlug}" (locations are addressed by region + location slug)`,
      });
    }
    checkUnique(
      problems,
      "npc-shops",
      shop.pool.map((entry) => `${shop.slug}:${entry.itemSlug}`),
      "pool item",
    );
    for (const entry of shop.pool) {
      const item = itemBySlug.get(entry.itemSlug);
      if (!item) {
        problems.push({
          domain: "npc-shops",
          subject: `${shop.slug}:${entry.itemSlug}`,
          message: "pool references an unknown item",
        });
      } else if ((item.lifecycle ?? "ACTIVE") === "DISABLED") {
        problems.push({
          domain: "npc-shops",
          subject: `${shop.slug}:${entry.itemSlug}`,
          message: "pool references a DISABLED item",
        });
      }
    }
    const config = shop.config ?? {};
    for (const [low, high] of [
      ["commonMin", "commonMax"],
      ["uncommonMin", "uncommonMax"],
      ["rareMin", "rareMax"],
    ] as const) {
      const min = config[low];
      const max = config[high];
      if (min !== undefined && max !== undefined && min > max) {
        problems.push({
          domain: "npc-shops",
          subject: shop.slug,
          message: `restock config ${low} exceeds ${high}`,
        });
      }
    }
  }

  // ---- Upgrade tiers: contiguous ladder from 1 -----------------------
  const tiers = [...content.upgradeTiers].sort((a, b) => a.tier - b.tier);
  tiers.forEach((tier, index) => {
    if (tier.tier !== index + 1) {
      problems.push({
        domain: "upgrade-tiers",
        subject: `tier-${tier.tier}`,
        message: `tiers must be contiguous from 1 (expected ${index + 1})`,
      });
    }
  });

  // ---- Daily words: capacity, lengths, duplicates, positions ---------
  const wordCounts = countWordAnswers(content.daily.wordAnswers);
  for (const [difficulty, counts] of Object.entries(wordCounts)) {
    if (counts.active < WORD_MIN_ACTIVE_ANSWERS) {
      problems.push({
        domain: "daily-words",
        subject: difficulty,
        message:
          `only ${counts.active} of ${counts.total} configured answers are active; ` +
          `the rotation needs at least ${WORD_MIN_ACTIVE_ANSWERS} active answers — ` +
          `append replacement words to the END of the ${difficulty} array in ` +
          `prisma/content/daily/word-answers.ts before deactivating others`,
      });
    }
  }
  for (const [difficulty, entries] of Object.entries(content.daily.wordAnswers)) {
    const length = WORD_LENGTHS[difficulty as keyof typeof WORD_LENGTHS];
    const seen = new Set<string>();
    entries.forEach((entry, position) => {
      const word = (typeof entry === "string" ? entry : entry.word).toUpperCase();
      const subject = `${difficulty}[${position}] ${word}`;
      if (!/^[A-Z]+$/.test(word)) {
        problems.push({
          domain: "daily-words",
          subject,
          message: "answers must be A-Z only",
        });
      }
      if (word.length !== length) {
        problems.push({
          domain: "daily-words",
          subject,
          message: `${difficulty} answers must be ${length} letters (got ${word.length})`,
        });
      }
      if (seen.has(word)) {
        problems.push({
          domain: "daily-words",
          subject,
          message: "duplicate word after normalization",
        });
      }
      seen.add(word);
    });
  }

  // ---- Wheel ---------------------------------------------------------
  const wheel = content.daily.wheel;
  const poolSlugs = new Set(wheel.pools.map((pool) => pool.slug));
  const activeWeight = wheel.configuration.prizes
    .filter((prize) => prize.active ?? true)
    .reduce((sum, prize) => sum + prize.weight, 0);
  if (activeWeight !== WHEEL_TOTAL_WEIGHT) {
    problems.push({
      domain: "wheel",
      subject: `${wheel.slug} v${wheel.configuration.version}`,
      message: `active prize weights sum to ${activeWeight}, expected ${WHEEL_TOTAL_WEIGHT}`,
    });
  }
  checkUnique(
    problems,
    "wheel",
    wheel.configuration.prizes.map((p) => String(p.displayOrder)),
    "prize displayOrder",
  );
  for (const prize of wheel.configuration.prizes) {
    if (prize.resultType === "COINS" && (prize.coinAmount ?? 0n) <= 0n) {
      problems.push({
        domain: "wheel",
        subject: prize.label,
        message: "COINS prizes need a positive coinAmount",
      });
    }
    if (prize.resultType === "ITEM_POOL") {
      if (!prize.poolSlug || !poolSlugs.has(prize.poolSlug)) {
        problems.push({
          domain: "wheel",
          subject: prize.label,
          message: `unknown item pool "${prize.poolSlug ?? "(none)"}"`,
        });
      }
    }
  }
  for (const pool of wheel.pools) {
    checkUnique(
      problems,
      "wheel",
      pool.entries.map((entry) => `${pool.slug}:${entry.itemSlug}`),
      "pool item",
    );
    for (const entry of pool.entries) {
      const item = itemBySlug.get(entry.itemSlug);
      const subject = `${pool.slug}:${entry.itemSlug}`;
      if (!item) {
        problems.push({ domain: "wheel", subject, message: "unknown item" });
        continue;
      }
      if ((item.lifecycle ?? "ACTIVE") !== "ACTIVE") {
        problems.push({
          domain: "wheel",
          subject,
          message: `pool items must be ACTIVE (got ${item.lifecycle})`,
        });
      }
      if ((entry.minimumQuantity ?? 1) > (entry.maximumQuantity ?? 1)) {
        problems.push({
          domain: "wheel",
          subject,
          message: "minimumQuantity exceeds maximumQuantity",
        });
      }
      if (!(item.stackable ?? true) && (entry.maximumQuantity ?? 1) > 1) {
        problems.push({
          domain: "wheel",
          subject,
          message: "instanced (non-stackable) prizes must award quantity 1",
        });
      }
    }
  }

  // Guaranteed arbitrage is a content error, not a warning: it would let a
  // player mint coins by buying requirements and handing them straight back.
  for (const row of requestBalanceReport(content)) {
    if (row.arbitrage) {
      problems.push({
        domain: "requests",
        subject: `${row.board}/${row.request}`,
        message:
          `reward ${row.reward} exceeds the NPC purchase cost of its requirements ` +
          `(${row.npcCost}) — this is guaranteed arbitrage; lower the reward or ` +
          `require items that are not sold by a shop`,
      });
    }
  }

  // ---- Community meal ------------------------------------------------
  const meal = content.daily.meal;
  checkUnique(
    problems,
    "meal",
    meal.entries.map((entry) => entry.itemSlug),
    "pool item",
  );
  for (const entry of meal.entries) {
    const item = itemBySlug.get(entry.itemSlug);
    if (!item) {
      problems.push({
        domain: "meal",
        subject: entry.itemSlug,
        message: "unknown item",
      });
      continue;
    }
    if (
      item.type !== "FOOD" ||
      item.category !== "food" ||
      item.rarity !== "COMMON" ||
      !(item.stackable ?? true) ||
      (item.lifecycle ?? "ACTIVE") !== "ACTIVE"
    ) {
      problems.push({
        domain: "meal",
        subject: entry.itemSlug,
        message:
          "meal pool entries must be ACTIVE, COMMON, stackable FOOD items in the food category",
      });
    }
  }

  // ---- Lantern hiding places ------------------------------------------
  // Every PUBLISHED location needs a clue, and every clue needs a
  // published location. The first half is the one that matters: without
  // it, adding a location and forgetting this file would quietly shrink
  // the hunt, and nothing at runtime would ever complain.
  const publishedAddresses = new Set<string>();
  for (const region of content.regions) {
    for (const location of region.locations) {
      if (region.published !== false && location.published !== false) {
        publishedAddresses.add(`${region.slug}/${location.slug}`);
      }
    }
  }
  checkUnique(
    problems,
    "lantern",
    content.daily.lanternClues.map((entry) => entry.locationRef),
    "lantern clue location",
  );
  const cluedAddresses = new Set<string>();
  for (const entry of content.daily.lanternClues) {
    cluedAddresses.add(entry.locationRef);
    if (!publishedAddresses.has(entry.locationRef)) {
      problems.push({
        domain: "lantern",
        subject: entry.locationRef,
        message:
          "clue points at a location that is missing or unpublished (the lantern cannot hide somewhere players cannot go)",
      });
    }
    // A riddle that names its own answer is not a riddle. Cheap check,
    // but it is the exact mistake a tired author makes.
    const [, locationSlug = ""] = entry.locationRef.split("/");
    const bareName = locationSlug.replace(/^the-/, "").replace(/-/g, " ");
    if (entry.clue.toLowerCase().includes(bareName)) {
      problems.push({
        domain: "lantern",
        subject: entry.locationRef,
        message: `clue contains the location's own name ("${bareName}")`,
      });
    }
  }
  for (const address of publishedAddresses) {
    if (!cluedAddresses.has(address)) {
      problems.push({
        domain: "lantern",
        subject: address,
        message:
          "published location has no lantern clue (add one to prisma/content/daily/lantern-clues.ts)",
      });
    }
  }

  // ---- Location activity attachments ---------------------------------
  // The world domain only stores type + key; these checks are what make an
  // attachment trustworthy before the database ever sees it.
  const shopByLocation = new Map(
    content.npcShops.map((shop) => [`${shop.regionSlug}/${shop.locationSlug}`, shop]),
  );
  const shopBySlug = new Map(content.npcShops.map((shop) => [shop.slug, shop]));
  const boardByKey = new Map(content.requestBoards.map((board) => [board.key, board]));
  const spotBySlug = new Map(content.forageSpots.map((spot) => [spot.slug, spot]));

  for (const region of content.regions) {
    for (const location of region.locations) {
      const address = `${region.slug}/${location.slug}`;
      const activities = location.activities ?? [];
      checkUnique(
        problems,
        "activities",
        activities.map((a) => `${address}:${a.type}:${a.activityKey}`),
        "attachment (type + key) at a location",
      );
      checkUnique(
        problems,
        "activities",
        activities.map((a) => `${address}@${a.displayOrder}`),
        "display order at a location",
      );

      for (const activity of activities) {
        const subject = `${address}:${activity.type}:${activity.activityKey}`;
        const isActive = activity.active ?? true;
        switch (activity.type) {
          case "NPC_SHOP": {
            const shop = shopBySlug.get(activity.activityKey);
            if (!shop) {
              problems.push({
                domain: "activities",
                subject,
                message: `no NPC shop with slug "${activity.activityKey}"`,
              });
              break;
            }
            // The shop's own location must be the location it is attached to.
            if (`${shop.regionSlug}/${shop.locationSlug}` !== address) {
              problems.push({
                domain: "activities",
                subject,
                message: `shop "${shop.slug}" belongs to ${shop.regionSlug}/${shop.locationSlug}, not ${address}`,
              });
            }
            break;
          }
          case "DAILY_WORD": {
            if (activity.activityKey !== DAILY_WORD_ACTIVITY_KEY) {
              problems.push({
                domain: "activities",
                subject,
                message: `daily word activity key must be "${DAILY_WORD_ACTIVITY_KEY}"`,
              });
            }
            break;
          }
          case "DAILY_WHEEL": {
            if (activity.activityKey !== content.daily.wheel.slug) {
              problems.push({
                domain: "activities",
                subject,
                message: `no prize wheel with slug "${activity.activityKey}"`,
              });
            }
            break;
          }
          case "DAILY_MEAL": {
            if (activity.activityKey !== content.daily.meal.slug) {
              problems.push({
                domain: "activities",
                subject,
                message: `no meal pool with slug "${activity.activityKey}"`,
              });
            }
            break;
          }
          case "SORTING_BENCH": {
            // The bench has no seeded configuration — its rules and its
            // payout tiers are code (modules/games/sorting), so there is
            // exactly one of it and its key is fixed.
            if (activity.activityKey !== SORTING_BENCH_ACTIVITY_KEY) {
              problems.push({
                domain: "activities",
                subject,
                message: `sorting bench activity key must be "${SORTING_BENCH_ACTIVITY_KEY}"`,
              });
            }
            break;
          }
          case "GIVEAWAY": {
            // The shelf has no seeded configuration — its rules and limits
            // are code (modules/giveaway) — so there is exactly one of it
            // and its key is fixed. A second shelf would split the pool,
            // and a pool split twice is two bare planks.
            if (activity.activityKey !== GIVEAWAY_ACTIVITY_KEY) {
              problems.push({
                domain: "activities",
                subject,
                message: `giveaway activity key must be "${GIVEAWAY_ACTIVITY_KEY}"`,
              });
            }
            break;
          }
          case "FORAGING": {
            const spot = spotBySlug.get(activity.activityKey);
            if (!spot) {
              problems.push({
                domain: "activities",
                subject,
                message: `no forage spot with slug "${activity.activityKey}"`,
              });
              break;
            }
            // A spot's own location must be the one it is attached to,
            // the same rule NPC shops follow.
            if (`${spot.regionSlug}/${spot.locationSlug}` !== address) {
              problems.push({
                domain: "activities",
                subject,
                message: `forage spot "${spot.slug}" belongs to ${spot.regionSlug}/${spot.locationSlug}, not ${address}`,
              });
            }
            if (isActive && spot.active === false) {
              problems.push({
                domain: "activities",
                subject,
                message: "an inactive forage spot is attached as active",
              });
            }
            break;
          }
          case "LANTERN_HUNT": {
            // The hunt has no seeded configuration beyond its clue list —
            // its rules are code (modules/daily/lantern) — so there is one
            // of it and its key is fixed. The attachment is only the
            // notice board; looking happens at every location, so a second
            // notice would be two copies of one riddle.
            if (activity.activityKey !== LANTERN_ACTIVITY_KEY) {
              problems.push({
                domain: "activities",
                subject,
                message: `lantern hunt activity key must be "${LANTERN_ACTIVITY_KEY}"`,
              });
            }
            break;
          }
          case "REQUEST_BOARD": {
            const board = boardByKey.get(activity.activityKey);
            if (!board) {
              problems.push({
                domain: "activities",
                subject,
                message: `no request board with key "${activity.activityKey}"`,
              });
              break;
            }
            if (isActive && board.active === false) {
              problems.push({
                domain: "activities",
                subject,
                message: "an inactive request board is attached as active",
              });
            }
            break;
          }
        }
      }
    }
  }

  // Every NPC shop must be reachable: a shop with no attachment is dead
  // content, since the location page renders only attachments now.
  for (const shop of content.npcShops) {
    const address = `${shop.regionSlug}/${shop.locationSlug}`;
    const region = content.regions.find((r) => r.slug === shop.regionSlug);
    const location = region?.locations.find((l) => l.slug === shop.locationSlug);
    const attached = (location?.activities ?? []).some(
      (a) => a.type === "NPC_SHOP" && a.activityKey === shop.slug,
    );
    if (location && !attached) {
      problems.push({
        domain: "activities",
        subject: shop.slug,
        message: `shop is not attached to ${address}; add an NPC_SHOP activity to that location`,
      });
    }
  }
  void shopByLocation;

  // Exactly one Leaving Shelf, world-wide. Everything on it is other
  // players' spares, and there are only ever so many spares in a day: two
  // shelves would be two mostly-bare planks instead of one worth walking
  // past. Zero is also wrong — the take path and the donate path are the
  // same feature, and half of it with no door is dead code.
  const shelves = content.regions.flatMap((region) =>
    region.locations.flatMap((location) =>
      (location.activities ?? [])
        .filter((activity) => activity.type === "GIVEAWAY")
        .map(() => `${region.slug}/${location.slug}`),
    ),
  );
  if (shelves.length !== 1) {
    problems.push({
      domain: "activities",
      subject: "giveaway",
      message:
        shelves.length === 0
          ? "no GIVEAWAY activity is attached anywhere; the Leaving Shelf has no door"
          : `the Leaving Shelf is attached ${shelves.length} times (${shelves.join(", ")}); there must be exactly one`,
    });
  }

  // The three daily activities must stay attached where the dashboard and
  // history link to them.
  const dailyAnchors: Array<[string, string]> = [
    [WORD_LOCATION_SLUG, "DAILY_WORD"],
    [WHEEL_LOCATION_SLUG, "DAILY_WHEEL"],
    [MEAL_LOCATION_SLUG, "DAILY_MEAL"],
  ];
  for (const [slug, type] of dailyAnchors) {
    const region = content.regions.find((r) => r.slug === DAILY_REGION_SLUG);
    const location = region?.locations.find((l) => l.slug === slug);
    if (!location) {
      problems.push({
        domain: "activities",
        subject: `${DAILY_REGION_SLUG}/${slug}`,
        message: `daily activity location is missing (referenced by src/server/modules/daily/locations.ts)`,
      });
      continue;
    }
    if (!location.published) {
      problems.push({
        domain: "activities",
        subject: `${DAILY_REGION_SLUG}/${slug}`,
        message: "daily activity location must be published",
      });
    }
    const attached = (location.activities ?? []).some(
      (a) => a.type === type && (a.active ?? true),
    );
    if (!attached) {
      problems.push({
        domain: "activities",
        subject: `${DAILY_REGION_SLUG}/${slug}`,
        message: `expected an active ${type} attachment here`,
      });
    }
  }

  // ---- Foraging -------------------------------------------------------
  checkUnique(
    problems,
    "foraging",
    content.forageSpots.map((spot) => spot.slug),
    "forage spot slug",
  );

  // The daily meal is a deliberately narrow supply valve, and the Hearth
  // board's difficulty is tuned against exactly its throughput (ADR-30).
  // A forage spot yielding a meal-pool item would silently double that
  // supply and re-price the board without anybody deciding to.
  //
  // Note what this does NOT forbid: foraging an item some request wants.
  // That is fine, and it is how a board other than the Hearth one can
  // exist at all. The invariant ADR-25 actually protects is that a reward
  // must not exceed what its ingredients cost from a shop — checked
  // separately, against NPC prices — and foraging spends no coins, so it
  // cannot create an arbitrage route.
  const mealItemSlugs = new Set(
    content.daily.meal.entries.map((entry) => entry.itemSlug),
  );

  for (const spot of content.forageSpots) {
    const region = content.regions.find((r) => r.slug === spot.regionSlug);
    const location = region?.locations.find((l) => l.slug === spot.locationSlug);
    if (!location) {
      problems.push({
        domain: "foraging",
        subject: spot.slug,
        message: `unknown location ${spot.regionSlug}/${spot.locationSlug}`,
      });
    } else if (!location.published) {
      problems.push({
        domain: "foraging",
        subject: spot.slug,
        message: "forage spots must sit at a published location",
      });
    } else {
      const attached = (location.activities ?? []).some(
        (a) => a.type === "FORAGING" && a.activityKey === spot.slug,
      );
      if (!attached) {
        problems.push({
          domain: "foraging",
          subject: spot.slug,
          message:
            "forage spot has no attachment — it would be unreachable content",
        });
      }
    }

    checkUnique(
      problems,
      "foraging",
      spot.entries.map((entry) => entry.itemSlug),
      `item in forage spot ${spot.slug}`,
    );

    let activeWeight = spot.nothingWeight ?? 0;
    for (const entry of spot.entries) {
      const subject = `${spot.slug}:${entry.itemSlug}`;
      if (entry.active ?? true) {
        activeWeight += entry.selectionWeight;
      }
      const item = itemBySlug.get(entry.itemSlug);
      if (!item) {
        problems.push({
          domain: "foraging",
          subject,
          message: "forage entry references an unknown item",
        });
        continue;
      }
      if ((item.lifecycle ?? "ACTIVE") !== "ACTIVE") {
        problems.push({
          domain: "foraging",
          subject,
          message: `forage entries must be ACTIVE items (got ${item.lifecycle})`,
        });
      }
      if (mealItemSlugs.has(entry.itemSlug)) {
        problems.push({
          domain: "foraging",
          subject,
          message:
            "daily meal pool items must not be foragable — the Hearth board's difficulty is tuned against the meal's throughput (ADR-30)",
        });
      }
    }
    if (activeWeight <= 0) {
      problems.push({
        domain: "foraging",
        subject: spot.slug,
        message: "forage spot has no active weight — nothing could be drawn",
      });
    }
  }

  // ---- Starter pack ---------------------------------------------------
  for (const slug of STARTER_PACK_SLUGS) {
    const item = itemBySlug.get(slug);
    if (!item) {
      problems.push({
        domain: "starter-pack",
        subject: slug,
        message: "starter pack references an unknown item",
      });
    } else if ((item.lifecycle ?? "ACTIVE") !== "ACTIVE") {
      problems.push({
        domain: "starter-pack",
        subject: slug,
        message: `starter pack items must be ACTIVE (got ${item.lifecycle})`,
      });
    }
  }

  // ---- Request boards --------------------------------------------------
  checkUnique(problems, "requests", content.requestBoards.map((b) => b.key), "board key");
  for (const board of content.requestBoards) {
    checkUnique(
      problems,
      "requests",
      board.requests.map((r) => `${board.key}/${r.slug}`),
      "request slug within board",
    );
    checkUnique(
      problems,
      "requests",
      board.requests.map((r) => `${board.key}@${r.sequencePosition}`),
      "sequence position within board",
    );

    const activeRequests = board.requests.filter((r) => r.active ?? true);
    if ((board.active ?? true) && activeRequests.length === 0) {
      problems.push({
        domain: "requests",
        subject: board.key,
        message: "an active board needs at least one active request",
      });
    }

    // Authored positions must be contiguous from 0 so the rotation order
    // is unambiguous.
    const positions = [...board.requests.map((r) => r.sequencePosition)].sort(
      (a, b) => a - b,
    );
    positions.forEach((position, index) => {
      if (position !== index) {
        problems.push({
          domain: "requests",
          subject: `${board.key}@${position}`,
          message: `sequence positions must be contiguous from 0 (expected ${index})`,
        });
      }
    });

    for (const request of board.requests) {
      const subject = `${board.key}/${request.slug}`;
      checkUnique(
        problems,
        "requests",
        request.requirements.map((r) => `${subject}:${r.itemSlug}`),
        "requirement item within a request",
      );
      if (request.rewardCoins <= 0n) {
        problems.push({
          domain: "requests",
          subject,
          message: "reward must be positive",
        });
      }
      for (const requirement of request.requirements) {
        const item = itemBySlug.get(requirement.itemSlug);
        if (!item) {
          problems.push({
            domain: "requests",
            subject,
            message: `unknown item "${requirement.itemSlug}"`,
          });
          continue;
        }
        if ((item.lifecycle ?? "ACTIVE") !== "ACTIVE") {
          problems.push({
            domain: "requests",
            subject,
            message: `requirement "${item.slug}" must be ACTIVE (got ${item.lifecycle})`,
          });
        }
        if (!(item.stackable ?? true)) {
          problems.push({
            domain: "requests",
            subject,
            message: `requirement "${item.slug}" must be stackable — instanced items would make the consumed copy ambiguous`,
          });
        }
        if (requirement.quantity <= 0) {
          problems.push({
            domain: "requests",
            subject,
            message: `requirement "${item.slug}" quantity must be positive`,
          });
        }
      }
    }
  }


  problems.push(...validateHollow(content, itemBySlug));

  // A companion's tastes are drawn from these tags, and the player is
  // never told what they are — so a taste is only fair if enough things
  // carry it that offering things can actually turn it up. A one-line
  // content edit that retires the last salted food would otherwise mint
  // companions with an undiscoverable palate.
  const countTagged = (tag: string, type: "FOOD" | "TOY") =>
    content.items.filter(
      (item) =>
        item.type === type &&
        (item.lifecycle ?? "ACTIVE") === "ACTIVE" &&
        item.tags.includes(tag),
    ).length;
  for (const tag of PALATE_FOOD_TAGS) {
    const found = countTagged(tag, "FOOD");
    if (found < MIN_FOODS_PER_TASTE) {
      problems.push({
        domain: "palate",
        subject: tag,
        message: `only ${found} active food(s) carry "${tag}" — a taste needs at least ${MIN_FOODS_PER_TASTE} to be discoverable`,
      });
    }
  }
  for (const tag of PALATE_TOY_TAGS) {
    const found = countTagged(tag, "TOY");
    if (found < MIN_TOYS_PER_TASTE) {
      problems.push({
        domain: "palate",
        subject: tag,
        message: `only ${found} active toy(s) carry "${tag}" — a taste needs at least ${MIN_TOYS_PER_TASTE} to be discoverable`,
      });
    }
  }
  for (const tag of [...PALATE_FOOD_TAGS, ...PALATE_TOY_TAGS]) {
    if (!tagSlugs.has(tag)) {
      problems.push({
        domain: "palate",
        subject: tag,
        message: "palate tag does not exist in the tag vocabulary",
      });
    }
  }

  // A region with no events of its own is quieter than the one the player
  // came from, which is exactly backwards — the newer place should feel
  // more alive, not less. Saltmere shipped with eight locations and not
  // one event before this rule existed.
  for (const region of content.regions) {
    const gated = RANDOM_EVENTS.filter((event) =>
      (event.eligibility?.routePrefixes ?? []).some((prefix) =>
        prefix.startsWith(`/explore/${region.slug}`),
      ),
    );
    if (gated.length === 0) {
      problems.push({
        domain: "random-events",
        subject: region.slug,
        message: `region "${region.slug}" has no events of its own — it would feel deader than the rest of the world`,
      });
    }
  }

  problems.push(...validateRandomEvents(RANDOM_EVENTS, itemBySlug));

  if (problems.length > 0) {
    throw new ContentValidationError(problems);
  }
  return content;
}
