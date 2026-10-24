import { cn } from "~/lib/utils";

/**
 * Height-animated disclosure using the grid-rows 0fr -> 1fr trick, so no JS
 * measurement or GSAP is needed. Used by FAQ rows and mobile sponsor cards.
 */
export function Collapse({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows] duration-300 ease-in-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        className
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
