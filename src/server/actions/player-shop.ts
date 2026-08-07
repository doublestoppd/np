"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import {
  updateShopDetails,
} from "@/server/modules/commerce/player-shops/commands/shop";
import {
  cancelListing,
  createListing,
  updateListingPrice,
} from "@/server/modules/commerce/player-shops/commands/listings";
import { purchaseListing } from "@/server/modules/commerce/player-shops/commands/purchase";
import { claimProceeds } from "@/server/modules/commerce/player-shops/commands/proceeds";
import { purchaseCapacityUpgrade } from "@/server/modules/commerce/player-shops/commands/upgrades";
import {
  claimSchema,
  createListingSchema,
  cancelListingSchema,
  listingActionSchema,
  listingPriceSchema,
  shopDetailsSchema,
  upgradeSchema,
} from "@/lib/validation";
import { coinsFromInput, coinsFromJSON, formatCoins } from "@/lib/money";
import { failWith, isRedirectError, safeReturnTo, succeedWith } from "./shared";

export async function updateShopDetailsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = shopDetailsSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input.";
    redirect(`/shop?error=${encodeURIComponent(message)}`);
  }
  try {
    await updateShopDetails(prisma, { userId: user.id, ...parsed.data });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith("/shop", error, { op: "update-shop-details", userId: user.id });
  }
  revalidatePath("/shop");
  succeedWith("/shop", "Shop details saved.");
}

export async function createListingAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = createListingSchema.safeParse({
    itemId: formData.get("itemId"),
    itemInstanceId: formData.get("itemInstanceId") ?? undefined,
    quantity: formData.get("quantity") ?? 1,
    unitPrice: formData.get("unitPrice"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`/shop?error=${encodeURIComponent("Check the listing details and try again.")}`);
  }
  try {
    const { result, replayed } = await createListing(prisma, {
      userId: user.id,
      itemId: parsed.data.itemId,
      itemInstanceId: parsed.data.itemInstanceId,
      quantity: parsed.data.quantity,
      unitPrice: coinsFromInput(parsed.data.unitPrice),
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidatePath("/shop");
    revalidatePath("/inventory");
    succeedWith(
      "/shop",
      replayed
        ? `Already listed — ${result.quantity} × ${result.itemName} is on your shelves.`
        : `Listed ${result.quantity} × ${result.itemName} at ${formatCoins(coinsFromJSON(result.unitPrice))} coins each.`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith("/shop", error, { op: "create-listing", userId: user.id });
  }
}

export async function updateListingPriceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = listingPriceSchema.safeParse({
    listingId: formData.get("listingId"),
    unitPrice: formData.get("unitPrice"),
  });
  if (!parsed.success) {
    redirect(`/shop?error=${encodeURIComponent("That price isn't valid.")}`);
  }
  try {
    await updateListingPrice(prisma, {
      userId: user.id,
      listingId: parsed.data.listingId,
      unitPrice: coinsFromInput(parsed.data.unitPrice),
    });
    revalidatePath("/shop");
    succeedWith("/shop", "Price updated.");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith("/shop", error, { op: "update-listing-price", userId: user.id });
  }
}

export async function cancelListingAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  // Cancelling takes a listing and a key — not a quantity or an expected
  // price, which is what the purchase schema would have spread in.
  const parsed = cancelListingSchema.safeParse({
    listingId: formData.get("listingId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`/shop?error=${encodeURIComponent("Invalid request.")}`);
  }
  try {
    await cancelListing(prisma, { userId: user.id, ...parsed.data });
    revalidatePath("/shop");
    revalidatePath("/inventory");
    succeedWith("/shop", "Listing cancelled — items returned to your satchel.");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith("/shop", error, { op: "cancel-listing", userId: user.id });
  }
}

export async function purchaseListingAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/market");
  const parsed = listingActionSchema.safeParse({
    listingId: formData.get("listingId"),
    quantity: formData.get("quantity") ?? 1,
    idempotencyKey: formData.get("idempotencyKey"),
    expectedUnitPrice: formData.get("expectedUnitPrice") ?? undefined,
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }
  try {
    const { result, replayed } = await purchaseListing(prisma, {
      buyerId: user.id,
      listingId: parsed.data.listingId,
      quantity: parsed.data.quantity,
      idempotencyKey: parsed.data.idempotencyKey,
      expectedUnitPrice:
        parsed.data.expectedUnitPrice === undefined
          ? undefined
          : coinsFromInput(parsed.data.expectedUnitPrice),
    });
    revalidatePath(returnTo);
    revalidatePath("/inventory");
    succeedWith(
      returnTo,
      replayed
        ? `Already bought — ${result.quantity} × ${result.itemName} is in your satchel.`
        : `Bought ${result.quantity} × ${result.itemName} from ${result.sellerUsername} for ${formatCoins(coinsFromJSON(result.totalPrice))} coins.` +
          (result.remaining > 0
            ? ` ${result.remaining} still on offer.`
            : ""),
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith(returnTo, error, { op: "purchase-listing", userId: user.id });
  }
}

export async function claimProceedsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = claimSchema.safeParse({
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`/shop?error=${encodeURIComponent("Invalid request.")}`);
  }
  try {
    const { result, replayed } = await claimProceeds(prisma, {
      userId: user.id,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidatePath("/shop");
    revalidatePath("/profile");
    succeedWith(
      "/shop",
      replayed
        ? `Already claimed — ${formatCoins(coinsFromJSON(result.claimed))} coins went to your wallet a moment ago.`
        : `Claimed ${formatCoins(coinsFromJSON(result.claimed))} coins from the till.`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith("/shop", error, { op: "claim-proceeds", userId: user.id });
  }
}

export async function purchaseUpgradeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = upgradeSchema.safeParse({
    tier: formData.get("tier"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`/shop?error=${encodeURIComponent("Invalid request.")}`);
  }
  try {
    const { result, replayed } = await purchaseCapacityUpgrade(prisma, {
      userId: user.id,
      tier: parsed.data.tier,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidatePath("/shop");
    succeedWith(
      "/shop",
      replayed
        ? `Already purchased — your shop holds ${result.newCapacity} listings.`
        : `Upgrade purchased — your shop now holds ${result.newCapacity} listings.`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith("/shop", error, { op: "purchase-upgrade", userId: user.id });
  }
}
