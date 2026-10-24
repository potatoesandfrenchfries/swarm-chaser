import { cn } from "~/lib/utils";

/**
 * Placeholder mark: a double-outlined flat-top hexagon around a solid inner hexagon.
 * Replace the inner paths with your logo; keep the viewBox so sizing holds.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 178 156"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
      className={cn("h-40 w-40 2xl:h-72 2xl:w-72", className)}
    >
      <polygon points="45,2 133,2 176,78 133,154 45,154 2,78" />
      <polygon
        points="52,13 126,13 164,78 126,143 52,143 14,78"
        strokeWidth={1.5}
      />
      <polygon
        points="68,40 110,40 132,78 110,116 68,116 46,78"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
