/**
 * Operator CLI for administrative commerce operations (docs/operations.md).
 * Runs with direct database credentials (DATABASE_URL), which is itself the
 * operator trust boundary; every operation still writes audit events and
 * ledger records, and disables rather than deletes.
 *
 * Usage: npx tsx scripts/admin-cli.ts <command> [args...]
 */
import { PrismaClient } from "@prisma/client";
import {
  adminDeactivateAccount,
  adminGrantCoins,
  adminGrantItem,
  adminInspectDaily,
  adminLookupBand,
  adminPreviewPuzzles,
  adminRegeneratePuzzle,
  adminSetPuzzleReward,
  adminValidateWheel,
  disablePlayerListing,
  previewRestock,
  setItemLifecycle,
  setNpcShopActive,
  setPlayerShopActive,
  setUserCommerceDisabled,
  triggerRestock,
} from "../src/server/modules/admin/operations";

const db = new PrismaClient();

function usage(): never {
  console.log(`Commands:
  item:lifecycle <slug> <DRAFT|ACTIVE|RETIRED|DISABLED>
                                         Set an item's lifecycle state
  npc-shop:disable <slug>                Close an NPC shop (history preserved)
  npc-shop:enable <slug>
  player-shop:disable <slug>             Close a player shop (history preserved)
  player-shop:enable <slug>
  listing:disable <listingId>            Disable a listing; escrow returns to seller
  user:disable-commerce <username>       Block an account from commerce
  user:enable-commerce <username>
  user:deactivate <username> <reason>    Soft-deactivate an account (escrow returned)
  grant:item <username> <itemSlug> <qty> Ledgered administrative item grant
  grant:coins <username> <amount>        Ledgered administrative coin grant
  restock:preview <shopSlug>             Deterministic dry-run for the current window
  restock:run <shopSlug>                 Execute/replay the current window (idempotent)
  events:recent [count]                  Show recent security events
  puzzle:band <username>                 Which rotation band an account plays
  puzzle:preview <YYYY-MM-DD> [band]     Preview ONE band's answers (operator-only!)
  puzzle:regenerate <YYYY-MM-DD> <EASY|MEDIUM|HARD> [band]
                                         Re-derive a FUTURE unplayed puzzle
  puzzle:set-reward <YYYY-MM-DD> <difficulty> <coins>
                                         Change a FUTURE unplayed puzzle's reward
  wheel:validate [wheelSlug]             Check active wheel config and pools
  daily:inspect <username> [count]       A player's daily outcomes + transactions`);
  process.exit(1);
}


async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const actor = "cli" as const;

  switch (command) {
    case "item:lifecycle": {
      const lifecycle = requireArg(args[1], "lifecycle");
      if (!["DRAFT", "ACTIVE", "RETIRED", "DISABLED"].includes(lifecycle)) {
        usage();
      }
      await setItemLifecycle(db, actor, {
        slug: requireArg(args[0], "slug"),
        lifecycle: lifecycle as "DRAFT" | "ACTIVE" | "RETIRED" | "DISABLED",
      });
      break;
    }
    case "npc-shop:disable":
    case "npc-shop:enable":
      await setNpcShopActive(db, actor, {
        slug: requireArg(args[0], "slug"),
        active: command === "npc-shop:enable",
      });
      break;
    case "player-shop:disable":
    case "player-shop:enable":
      await setPlayerShopActive(db, actor, {
        slug: requireArg(args[0], "slug"),
        active: command === "player-shop:enable",
      });
      break;
    case "listing:disable":
      await disablePlayerListing(db, actor, {
        listingId: requireArg(args[0], "listingId"),
      });
      break;
    case "user:disable-commerce":
    case "user:enable-commerce":
      await setUserCommerceDisabled(db, actor, {
        username: requireArg(args[0], "username"),
        disabled: command === "user:disable-commerce",
      });
      break;
    case "grant:item":
      await adminGrantItem(db, actor, {
        username: requireArg(args[0], "username"),
        itemSlug: requireArg(args[1], "itemSlug"),
        quantity: Number.parseInt(requireArg(args[2], "quantity"), 10),
      });
      break;
    case "grant:coins":
      await adminGrantCoins(db, actor, {
        username: requireArg(args[0], "username"),
        amount: BigInt(requireArg(args[1], "amount")),
      });
      break;
    case "user:deactivate":
      await adminDeactivateAccount(db, actor, {
        username: requireArg(args[0], "username"),
        reason: requireArg(args[1], "reason"),
      });
      break;
    case "restock:preview": {
      const preview = await previewRestock(db, actor, {
        shopSlug: requireArg(args[0], "shopSlug"),
      });
      console.log(JSON.stringify(preview, null, 2));
      break;
    }
    case "restock:run": {
      const restock = await triggerRestock(db, actor, {
        shopSlug: requireArg(args[0], "shopSlug"),
      });
      console.log(JSON.stringify({ id: restock.id, status: restock.status, summary: restock.summary }, null, 2));
      break;
    }
    case "puzzle:band": {
      const band = await adminLookupBand(db, actor, {
        username: requireArg(args[0], "username"),
      });
      console.log(JSON.stringify(band, null, 2));
      break;
    }
    case "puzzle:preview": {
      const preview = await adminPreviewPuzzles(db, actor, {
        gameDate: requireArg(args[0], "gameDate"),
        band: parseBand(args[1]),
      });
      console.log(JSON.stringify(preview, null, 2));
      break;
    }
    case "puzzle:regenerate": {
      const difficulty = requireArg(args[1], "difficulty");
      if (!["EASY", "MEDIUM", "HARD"].includes(difficulty)) {
        usage();
      }
      const result = await adminRegeneratePuzzle(db, actor, {
        gameDate: requireArg(args[0], "gameDate"),
        difficulty: difficulty as "EASY" | "MEDIUM" | "HARD",
        band: parseBand(args[2]),
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "puzzle:set-reward": {
      const difficulty = requireArg(args[1], "difficulty");
      if (!["EASY", "MEDIUM", "HARD"].includes(difficulty)) {
        usage();
      }
      await adminSetPuzzleReward(db, actor, {
        gameDate: requireArg(args[0], "gameDate"),
        difficulty: difficulty as "EASY" | "MEDIUM" | "HARD",
        rewardCoins: BigInt(requireArg(args[2], "coins")),
      });
      break;
    }
    case "wheel:validate": {
      const report = await adminValidateWheel(db, actor, {
        wheelSlug: args[0] ?? "brassbell-wheel",
      });
      console.log(JSON.stringify(report, null, 2));
      break;
    }
    case "daily:inspect": {
      const report = await adminInspectDaily(db, actor, {
        username: requireArg(args[0], "username"),
        take: args[1] ? Number.parseInt(args[1], 10) : 20,
      });
      console.log(JSON.stringify(report, null, 2));
      break;
    }
    case "events:recent": {
      const events = await db.securityEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: Number.parseInt(args[0] ?? "20", 10),
      });
      for (const event of events) {
        console.log(
          `${event.createdAt.toISOString()} [${event.severity}] ${event.type}: ${event.message}`,
        );
      }
      break;
    }
    default:
      usage();
  }
  console.log("done");
}

/**
 * Optional rotation band, defaulting to 0. Range is checked in the domain
 * (assertBand) — this only rejects text that is not a number at all, so a
 * typo does not silently become band 0.
 */
function parseBand(value: string | undefined): number {
  if (value === undefined) return 0;
  const band = Number(value);
  if (!Number.isInteger(band)) {
    console.error(`Band must be a whole number, got: ${value}`);
    usage();
  }
  return band;
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) {
    console.error(`Missing argument: ${name}`);
    usage();
  }
  return value;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
