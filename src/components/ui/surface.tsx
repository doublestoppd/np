interface SurfaceProps {
  children: React.ReactNode;
  /** Raised surfaces get a stronger background and shadow. */
  raised?: boolean;
  /** Set false when the content manages its own padding (e.g. media). */
  padded?: boolean;
  className?: string;
  as?: "div" | "section" | "article" | "li";
  "aria-labelledby"?: string;
}

/** The standard content panel: bordered, softly rounded, token-driven. */
export function Surface({
  children,
  raised = false,
  padded = true,
  className = "",
  as: Tag = "div",
  ...rest
}: SurfaceProps) {
  return (
    <Tag
      className={`rounded-surface border border-border ${
        raised ? "bg-surface-raised shadow-surface" : "bg-surface"
      } ${padded ? "p-4 sm:p-5" : "overflow-hidden"} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
}
