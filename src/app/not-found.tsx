import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 py-16">
      <EmptyState
        icon="🍂"
        title="Nothing here"
        description="This path leads to a patch of very ordinary leaves. Whatever you were looking for is somewhere else."
        action={
          <Link href="/" className={buttonClasses("secondary")}>
            Head home
          </Link>
        }
      />
    </main>
  );
}
