import { cn } from "~/lib/utils";
import { Stripes } from "./stripes";

export type Palette = "warm" | "blue" | "green" | "pink" | "purple";

/**
 * A landing section: full-bleed stripe band with the title over it, then
 * content. `palette` recolours the stripes, links and anything inside that
 * reads --stripe-* / --accent. `id` is the anchor target.
 */
export function RailwaySection({
  id,
  palette,
  title,
  stripeOpacity = 0.7,
  className,
  children,
}: {
  id: string;
  palette: Palette;
  title: string;
  stripeOpacity?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-palette={palette}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-4"
    >
      <div className="relative flex min-h-16 items-center py-1 md:min-h-20">
        <Stripes opacity={stripeOpacity} />
        <div className="rw-content relative">
          <h2
            id={`${id}-heading`}
            className="text-balance text-[clamp(2rem,6vw,3.75rem)] font-bold leading-tight tracking-[-0.03em]"
          >
            {title}
          </h2>
        </div>
      </div>
      <div className={cn("rw-content py-12 md:py-[4.5rem]", className)}>
        {children}
      </div>
    </section>
  );
}
