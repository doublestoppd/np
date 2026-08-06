import type { Metadata } from "next";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-emerald-900">Explore</h1>
      <section className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-10 text-center">
        <span aria-hidden="true" className="text-4xl">
          🧭
        </span>
        <h2 className="mt-3 text-lg font-semibold">The grove is still waking up</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-stone-600">
          Trails, quests, and hidden clearings will open here in a future
          update. For now, keep your companion fed and rested.
        </p>
      </section>
    </>
  );
}
