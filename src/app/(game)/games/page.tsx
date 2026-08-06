import type { Metadata } from "next";

export const metadata: Metadata = { title: "Games" };

export default function GamesPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-emerald-900">Games</h1>
      <section className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-10 text-center">
        <span aria-hidden="true" className="text-4xl">
          🎲
        </span>
        <h2 className="mt-3 text-lg font-semibold">Minigames coming soon</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-stone-600">
          The first minigame is on its way. Winnings will be granted by the
          server, so every coin will be honestly earned.
        </p>
      </section>
    </>
  );
}
