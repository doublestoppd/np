import { requireUser } from "@/server/auth/session";
import { GameShell } from "@/components/nav/game-shell";

export default async function GameLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  return (
    <GameShell coins={user.coins} isAdmin={user.isAdmin}>
      {children}
    </GameShell>
  );
}
