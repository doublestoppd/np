import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { signOut } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Profile" };

const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function ProfilePage() {
  const user = await requireUser();

  const [petCount, recentTransactions] = await Promise.all([
    prisma.pet.count({ where: { ownerId: user.id } }),
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { item: true },
    }),
  ]);

  return (
    <>
      <h1 className="text-2xl font-bold text-emerald-900">Profile</h1>

      <section
        aria-labelledby="account-heading"
        className="mt-4 rounded-2xl border border-stone-200 bg-white p-5"
      >
        <h2 id="account-heading" className="text-lg font-semibold">
          {user.username}
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-stone-500">Coins</dt>
            <dd className="font-semibold tabular-nums">{user.coins}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Companions</dt>
            <dd className="font-semibold tabular-nums">{petCount}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-stone-500">Member since</dt>
            <dd className="font-semibold">
              {DATE_FORMAT.format(user.createdAt)}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="activity-heading" className="mt-6">
        <h2 id="activity-heading" className="text-lg font-semibold">
          Recent activity
        </h2>
        {recentTransactions.length === 0 ? (
          <p className="mt-2 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
            No activity yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {recentTransactions.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {tx.note ?? tx.item?.name ?? tx.type}
                  </p>
                  <p className="text-xs text-stone-500">
                    {DATE_FORMAT.format(tx.createdAt)}
                  </p>
                </div>
                {tx.coinsDelta !== 0 && (
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${
                      tx.coinsDelta > 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {tx.coinsDelta > 0 ? "+" : ""}
                    {tx.coinsDelta}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="min-h-11 w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 font-semibold text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:w-auto"
        >
          Sign out
        </button>
      </form>
    </>
  );
}
