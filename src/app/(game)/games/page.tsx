import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Games" };

export default function GamesPage() {
  return (
    <>
      <PageHeader title="Games" />
      <EmptyState
        icon="🎲"
        title="Minigames coming soon"
        description="The first minigame is on its way. Winnings will be granted by the server, so every coin will be honestly earned."
      />
    </>
  );
}
