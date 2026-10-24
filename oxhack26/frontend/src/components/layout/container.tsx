import { cn } from "~/lib/utils";

/**
 * Centred page column for landing sections. The generous `sm:px-24` clears
 * the frame's left rail; cap width on very large screens.
 */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full">
      <div
        className={cn(
          "mx-auto w-full px-3 py-10 sm:px-24 md:py-24 2xl:max-w-[1400px]",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
