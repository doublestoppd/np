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
  npcShopSchema,
  regionSchema,
  requestBoardSchema,
  speciesSchema,
  upgradeTierSchema,
} from "../content/schemas";
import {
  DAILY_REGION_SLUG,
  MEAL_LOCATION_SLUG,
  WHEEL_LOCATION_SLUG,
  WORD_LOCATION_SLUG,
} from "../../src/server/modules/daily/locations";
import { DAILY_WORD_ACTIVITY_KEY } from "../../src/server/modules/daily/word/config";
import { STARTER_PACK_SLUGS } from "../../src/server/modules/pets/starter-pack";

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
export const WHEEL_TOTAL_WEIGHT = 10_000;

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

  // ---- Location activity attachments ---------------------------------
  // The world domain only stores type + key; these checks are what make an
  // attachment trustworthy before the database ever sees it.
  const shopByLocation = new Map(
    content.npcShops.map((shop) => [`${shop.regionSlug}/${shop.locationSlug}`, shop]),
  );
  const shopBySlug = new Map(content.npcShops.map((shop) => [shop.slug, shop]));
  const boardByKey = new Map(content.requestBoards.map((board) => [board.key, board]));

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

  if (problems.length > 0) {
    throw new ContentValidationError(problems);
  }
  return content;
}
