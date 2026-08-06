interface SkeletonProps {
  className?: string;
}

/**
 * Loading placeholder block. The pulse animation is disabled automatically
 * under prefers-reduced-motion (global rule in globals.css).
 */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-control bg-border ${className}`.trim()}
    />
  );
}
