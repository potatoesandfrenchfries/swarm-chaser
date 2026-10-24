import { cn } from "~/lib/utils";

/**
 * Four equal flat bands, stretched to fill the parent (`preserveAspectRatio="none"`
 * lets one 1x4 box fit any width/height). Colours come from the nearest
 * `data-palette` (--stripe-1..4). The parent must be `relative`.
 */
export function Stripes({
  className,
  opacity = 1,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <svg
      viewBox="0 0 1 4"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
      className={cn(
        "pointer-events-none absolute inset-0 size-full select-none [shape-rendering:crispEdges]",
        className
      )}
      style={{ opacity }}
    >
      {/* overshoot the viewBox so there are no hairline gaps at the edges */}
      <path d="M-1 -1H2V1H-1Z" style={{ fill: "var(--stripe-1)" }} />
      <path d="M-1 1H2V2H-1Z" style={{ fill: "var(--stripe-2)" }} />
      <path d="M-1 2H2V3H-1Z" style={{ fill: "var(--stripe-3)" }} />
      <path d="M-1 3H2V5H-1Z" style={{ fill: "var(--stripe-4)" }} />
    </svg>
  );
}
