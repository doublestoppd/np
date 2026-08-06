"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { EconomyError } from "@/server/services/economy/errors";
import { purchaseFromNpcShop } from "@/server/services/economy/npc-shop";
import {
  cancelListing,
  claimProceeds,
  createListing,
  purchaseCapacityUpgrade,
  purchaseListing,
  updateListingPrice,
  updateShopDetails,
} from "@/server/services/economy/player-shop";
import {
  claimSchema,
  createListingSchema,
  listingActionSchema,
  listingPriceSchema,
  npcPurchaseSchema,
  shopDetailsSchema,
  upgradeSchema,
} from "@/lib/validation";

/**
 * Thin, Zod-validated wrappers around the economy services. Every economic
 * decision (price, stock, ownership, balance) is server-derived; client
 * input is identifiers, quantities, and idempotency keys only. Errors
 * surface as generic public messages via redirect params.
 */

const ALLOWED_RETURN_PREFIXES = [
  "/explore",
  "/items",
  "/market",
  "/shops",
  "/shop",
  "/inventory",
];

function safeReturnTo(value: FormDataEntryValue | null, fallback: string): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("?") &&
    ALLOWED_RETURN_PREFIXES.some(
      (prefix) => value === prefix || value.startsWith(`${prefix}/`),
    )
  ) {
    return value;
  }
  return fallback;
}

function failWith(returnTo: string, error: unknown): never {
  const message =
    error instanceof EconomyError
      ? error.publicMessage
      : "That didn't work. Try again.";
  redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
}

function succeedWith(returnTo: string, notice: string): never {
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

export async function purchaseNpcStockAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/explore");
  const parsed = npcPurchaseSchema.safeParse({
    stockId: formData.get("stockId"),
    quantity: formData.get("quantity") ?? 1,
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }
  try {
    const result = await purchaseFromNpcShop(prisma, {
      userId: user.id,
      ...parsed.data,
    });
    revalidatePath(returnTo);
    revalidatePath("/inventory");
    succeedWith(
      returnTo,
      `Bought ${result.quantity} × ${result.itemName} for ${result.totalPrice} coins.`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith(returnTo, error);
  }
}

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
    failWith("/shop", error);
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
    const result = await createListing(prisma, { userId: user.id, ...parsed.data });
    revalidatePath("/shop");
    revalidatePath("/inventory");
    succeedWith(
      "/shop",
      `Listed ${result.quantity} × ${result.itemSlug} at ${result.unitPrice} coins each.`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith("/shop", error);
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
    await updateListingPrice(prisma, { userId: user.id, ...parsed.data });
    revalidatePath("/shop");
    succeedWith("/shop", "Price updated.");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith("/shop", error);
  }
}

export async function cancelListingAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = listingActionSchema.safeParse({
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
    failWith("/shop", error);
  }
}

export async function purchaseListingAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const returnTo = safeReturnTo(formData.get("returnTo"), "/market");
  const parsed = listingActionSchema.safeParse({
    listingId: formData.get("listingId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid request.")}`);
  }
  try {
    const result = await purchaseListing(prisma, {
      buyerId: user.id,
      listingId: parsed.data.listingId,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidatePath(returnTo);
    revalidatePath("/inventory");
    succeedWith(
      returnTo,
      `Bought ${result.quantity} × ${result.itemName} from ${result.sellerUsername} for ${result.totalPrice} coins.`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith(returnTo, error);
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
    const result = await claimProceeds(prisma, {
      userId: user.id,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidatePath("/shop");
    revalidatePath("/profile");
    succeedWith("/shop", `Claimed ${result.claimed} coins from the till.`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith("/shop", error);
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
    const result = await purchaseCapacityUpgrade(prisma, {
      userId: user.id,
      tier: parsed.data.tier,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    revalidatePath("/shop");
    succeedWith(
      "/shop",
      `Upgrade purchased — your shop now holds ${result.newCapacity} listings.`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    failWith("/shop", error);
  }
}
