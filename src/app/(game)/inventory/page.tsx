import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { feedPetAction } from "@/server/actions/pets";
import { FeedbackBanner, firstParam } from "@/components/feedback-banner";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  const [entries, pet, params] = await Promise.all([
    prisma.inventoryEntry.findMany({
      where: { userId: user.id, quantity: { gt: 0 } },
      include: { item: true },
      orderBy: [{ item: { type: "asc" } }, { item: { name: "asc" } }],
    }),
    prisma.pet.findFirst({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" },
    }),
    searchParams,
  ]);

  const food = entries.filter((entry) => entry.item.type === "FOOD");
  const toys = entries.filter((entry) => entry.item.type === "TOY");

  return (
    <>
      <h1 className="text-2xl font-bold text-emerald-900">Inventory</h1>

      <div className="mt-4">
        <FeedbackBanner
          notice={firstParam(params.notice)}
          error={firstParam(params.error)}
        />
      </div>

      {entries.length === 0 && (
        <p className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          Your satchel is empty. Items you collect will appear here.
        </p>
      )}

      {food.length > 0 && (
        <section aria-labelledby="food-heading" className="mt-2">
          <h2 id="food-heading" className="text-lg font-semibold">
            Food
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {food.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {entry.item.name}{" "}
                    <span className="text-sm font-normal text-stone-500">
                      ×{entry.quantity}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-stone-600">
                    {entry.item.description}
                  </p>
                </div>
                {pet && (
                  <form action={feedPetAction} className="shrink-0">
                    <input type="hidden" name="petId" value={pet.id} />
                    <input type="hidden" name="itemId" value={entry.itemId} />
                    <input type="hidden" name="returnTo" value="/inventory" />
                    <button
                      type="submit"
                      className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                    >
                      Feed
                      <span className="sr-only">
                        {" "}
                        {entry.item.name} to {pet.name}
                      </span>
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {toys.length > 0 && (
        <section aria-labelledby="toys-heading" className="mt-6">
          <h2 id="toys-heading" className="text-lg font-semibold">
            Toys
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {toys.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-stone-200 bg-white px-4 py-3"
              >
                <p className="font-medium">
                  {entry.item.name}{" "}
                  <span className="text-sm font-normal text-stone-500">
                    ×{entry.quantity}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-stone-600">
                  {entry.item.description}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
