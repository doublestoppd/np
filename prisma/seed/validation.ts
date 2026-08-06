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
  speciesSchema,
  upgradeTierSchema,
} from "../content/schemas";

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

/** Validates everything; throws ContentValidationError listing ALL problems. */
export function validateAllContent(): GameContent {
  const content = gameContent;
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

  // ---- Uniqueness ----------------------------------------------------
  checkUnique(problems, "species", content.species.map((s) => s.slug));
  checkUnique(problems, "categories", content.categories.map((c) => c.slug));
  checkUnique(problems, "tags", content.tags.map((t) => t.slug));
  checkUnique(problems, "items", content.items.map((i) => i.slug));
  checkUnique(problems, "world", content.regions.map((r) => r.slug));
  const locationSlugs = content.regions.flatMap((r) => r.locations.map((l) => l.slug));
  checkUnique(problems, "world", locationSlugs, "location slug");
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
  const locationSet = new Set(locationSlugs);

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
    if (!locationSet.has(shop.locationSlug)) {
      problems.push({
        domain: "npc-shops",
        subject: shop.slug,
        message: `unknown location "${shop.locationSlug}"`,
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

  // ---- Daily words: lengths, duplicates, positions -------------------
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

  if (problems.length > 0) {
    throw new ContentValidationError(problems);
  }
  return content;
}
