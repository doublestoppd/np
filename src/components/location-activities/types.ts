import type { LocationActivityType } from "@prisma/client";
import type { LocationActivityView } from "@/server/modules/world/world";

/** The location a viewer is standing on, as activities receive it. */
export interface LocationPageContext {
  id: string;
  slug: string;
  name: string;
  regionSlug: string;
  regionName: string;
  /** Canonical path back to this location (for action returnTo). */
  path: string;
}

export interface AuthenticatedViewer {
  id: string;
  username: string;
  coins: bigint;
}

export interface LocationActivityRendererProps {
  attachment: LocationActivityView;
  location: LocationPageContext;
  viewer: AuthenticatedViewer;
}

/**
 * An activity renderer is an async server component. It owns its own data
 * loading through its domain module — the location page passes only
 * identity and context, never activity-specific state.
 */
export type LocationActivityRenderer = (
  props: LocationActivityRendererProps,
) => Promise<React.ReactNode>;

export type LocationActivityRegistry = Record<
  LocationActivityType,
  LocationActivityRenderer
>;
