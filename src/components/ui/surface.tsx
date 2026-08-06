interface SurfaceProps {
  children: React.ReactNode;
  /** Raised surfaces get a stronger background and shadow. */
  raised?: boolean;
  /** Set false when the content manages its own padding (e.g. media). */
  padded?: boolean;
  /** "compact" tightens padding for dense list rows and tiles. */
  density?: "standard" | "compact";
  className?: string;
  as?: "div" | "section" | "article" | "li";
  id?: string;
  "aria-labelledby"?: string;
}

/** The standard content panel: bordered, softly rounded, token-driven. */
export function Surface({
  children,
  raised = false,
  padded = true,
  density = "standard",
  className = "",
  as: Tag = "div",
  ...rest
}: SurfaceProps) {
  const padding = density === "compact" ? "p-3" : "p-4 sm:p-5";
  return (
    <Tag
      className={`rounded-surface border border-border ${
        raised ? "bg-surface-raised shadow-surface" : "bg-surface"
      } ${padded ? padding : "overflow-hidden"} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
}
