import { Surface } from "@/components/ui/surface";
import { SectionHeading } from "@/components/ui/section-heading";
import { InlineNotice } from "@/components/ui/inline-notice";
import { StatusBadge, type PlayerStatus } from "@/components/ui/status-badge";

interface ActivitySectionProps {
  title: string;
  /** Short flavor or explanatory line under the title. */
  description?: string;
  /** Today's state, shown beside the title. */
  status?: { status: PlayerStatus; label?: string };
  headingId: string;
  children: React.ReactNode;
}

/**
 * The shared frame around every activity on a location page: one title,
 * one status, one content area. Locations may host several activities, so
 * the frame is deliberately flat — no nested cards, consistent heading
 * level, consistent spacing.
 */
export function ActivitySection({
  title,
  description,
  status,
  headingId,
  children,
}: ActivitySectionProps) {
  return (
    <Surface as="section" raised aria-labelledby={headingId} className="mt-4">
      <SectionHeading
        id={headingId}
        description={description}
        action={
          status ? (
            <StatusBadge status={status.status} label={status.label} />
          ) : undefined
        }
      >
        {title}
      </SectionHeading>
      <div className="mt-3">{children}</div>
    </Surface>
  );
}

/**
 * Rendered in place of an activity that could not load. One misconfigured
 * activity must never blank the location page, and the player never sees
 * the underlying configuration error.
 */
export function ActivityUnavailable() {
  return (
    <Surface as="section" className="mt-4">
      <InlineNotice tone="warning">
        This activity is taking a moment off. Everything else here still
        works — try again later.
      </InlineNotice>
    </Surface>
  );
}
