import { cn } from "~/lib/utils";

const ROTATIONS = [
  "left-0 top-0",
  "right-0 top-0 rotate-90",
  "bottom-0 right-0 rotate-180",
  "bottom-0 left-0 -rotate-90",
] as const;

/**
 * Chamfered corner brackets drawn on the four corners of the parent.
 * The parent must be `relative`. Colour follows `currentColor`.
 * Each svg is tagged `data-corner` so GSAP can target them.
 */
export function CornerBrackets({
  className,
  size = 48,
  strokeWidth = 1,
}: {
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full",
        className
      )}
    >
      {ROTATIONS.map((position) => (
        <svg
          key={position}
          data-corner
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          className={cn("absolute", position)}
        >
          <path
            d="M0.5 47.5V12.5L13 0.5H47.5"
            stroke="currentColor"
            strokeWidth={strokeWidth}
          />
        </svg>
      ))}
    </div>
  );
}
