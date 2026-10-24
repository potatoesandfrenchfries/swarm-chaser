import { Collapse } from "~/components/module/collapse";
import { BulletLabel } from "~/components/module/bullet-label";
import { cn } from "~/lib/utils";

/**
 * One step of a long form. The header is a full-width button with a
 * "N QUESTIONS" caption, a big heading and a triangle chevron. `disabled`
 * shows a LOCKED tag; `invalid` tints the header.
 * Content stays mounted while collapsed so field state is preserved.
 */
export function AccordionSection({
  id,
  title,
  questionsCount,
  expanded,
  disabled,
  invalid,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  questionsCount?: number;
  expanded: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-background">
      <button
        type="button"
        id={`${id}-header`}
        aria-expanded={expanded}
        aria-controls={`${id}-panel`}
        disabled={disabled}
        onClick={() => onToggle(id)}
        className={cn(
          "relative flex w-full items-center justify-between p-8 pt-12 text-left transition-colors hover:bg-muted md:p-10 md:pt-14 lg:p-12 lg:pt-16",
          expanded && "bg-muted/60",
          invalid && "bg-destructive/10",
          disabled && "cursor-not-allowed opacity-50 hover:bg-background"
        )}
      >
        {typeof questionsCount === "number" && (
          <BulletLabel className="absolute left-8 top-5 text-muted-foreground md:left-10 lg:left-12">
            {questionsCount} QUESTIONS
          </BulletLabel>
        )}
        <h2 className="font-heading text-2xl font-bold md:text-4xl lg:text-5xl">
          {title}
        </h2>

        {disabled && (
          <span className="absolute bottom-0 right-[15%] bg-foreground px-2 py-1 text-[0.6rem] text-background">
            LOCKED
          </span>
        )}
        <svg
          width="14"
          height="13"
          viewBox="0 0 14 13"
          aria-hidden
          className={cn(
            "absolute right-5 top-1/2 h-3 w-4 -translate-y-1/2 transition-transform sm:right-9",
            expanded && "rotate-180"
          )}
        >
          <path
            d="M1 1L12.5 1L6.5 11.5L1 1Z"
            fill="currentColor"
            stroke="currentColor"
          />
        </svg>
      </button>

      <Collapse open={expanded} id={`${id}-panel`}>
        <div className="p-8 pb-16 md:p-10 md:pb-16 lg:p-12 lg:pb-16">
          {children}
        </div>
      </Collapse>
    </section>
  );
}
