import { cn } from "~/lib/utils";

/**
 * Square bullet + tiny uppercase caption. The most repeated motif in the
 * design: section subtitles, tier tags, role tags, "N QUESTIONS", etc.
 * The bullet inherits `currentColor`, so it works on dark surfaces too.
 */
export function BulletLabel({
  children,
  size = "sm",
  className,
}: {
  children: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "shrink-0 bg-current",
          size === "sm" ? "size-1.5 sm:size-2" : "size-2"
        )}
      />
      <p className="label">{children}</p>
    </div>
  );
}
