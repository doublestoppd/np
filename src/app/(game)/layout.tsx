import { requireUser } from "@/server/auth/session";
import { GameNav } from "@/components/nav/game-nav";

export default async function GameLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();

  return (
    <div className="min-h-dvh md:pl-56">
      <GameNav />
      <main
        id="main"
        className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:pb-10"
      >
        {children}
      </main>
    </div>
  );
}
