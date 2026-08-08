import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const USER = "wanderer_ivy";
const prisma = new PrismaClient();

async function grant(slug: string, qty: number) {
  const user = await prisma.user.findFirstOrThrow({
    where: { normalizedUsername: USER },
  });
  const item = await prisma.item.findUnique({ where: { slug } });
  if (!item) {
    console.log("MISSING ITEM", slug);
    return;
  }
  await prisma.inventoryEntry.upsert({
    where: { userId_itemId: { userId: user.id, itemId: item.id } },
    create: { userId: user.id, itemId: item.id, quantity: qty },
    update: { quantity: qty },
  });
  console.log("granted", slug, qty);
}

async function coins(amount: bigint) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirstOrThrow({
      where: { normalizedUsername: USER },
    });
    const delta = amount - user.coins;
    if (delta === 0n) return;
    await tx.user.update({ where: { id: user.id }, data: { coins: amount } });
    await tx.transaction.create({
      data: {
        userId: user.id,
        type: "ADMIN_ADJUST",
        coinsDelta: delta,
        note: "playtest top-up",
      },
    });
  });
  console.log("coins ->", amount);
}

async function main() {
  const slugs = process.argv.slice(2);
  if (slugs[0] === "coins") {
    await coins(BigInt(slugs[1]!));
  } else {
    for (const s of slugs) {
      const [slug, q] = s.split(":");
      await grant(slug!, Number(q ?? 3));
    }
  }
  await prisma.$disconnect();
}
main();
