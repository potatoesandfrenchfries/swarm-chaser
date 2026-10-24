"use client";

import Link from "next/link";

import { useScramble } from "~/hooks/use-scramble";
import { cn } from "~/lib/utils";

type ChamferButtonProps = {
  label: string;
  /** Renders a Link when set, otherwise a <button>. */
  href?: string;
  onClick?: () => void;
  /** corner: cut bottom-left (navbar). tag: ticket shape (secondary CTA). */
  shape?: "corner" | "tag";
  icon?: React.ReactNode;
  external?: boolean;
  className?: string;
};

const SHAPES = {
  corner: "clip-chamfer-bl h-14 w-48 md:w-56",
  tag: "clip-tag h-12 px-14",
} as const;

/** Solid ink button with a cut corner and a scramble-text hover. */
export function ChamferButton({
  label,
  href,
  onClick,
  shape = "corner",
  icon,
  external,
  className,
}: ChamferButtonProps) {
  const { ref, play, reset } = useScramble(label);

  const classes = cn(
    "group inline-flex items-center justify-center gap-2 bg-foreground text-xs uppercase tracking-wide text-background transition-colors hover:bg-foreground/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    SHAPES[shape],
    className
  );

  const content = (
    <>
      <span ref={ref}>{label}</span>
      {icon && (
        <span className="transition-transform duration-200 group-hover:translate-x-1">
          {icon}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        onMouseEnter={play}
        onMouseLeave={reset}
        {...(external && { target: "_blank", rel: "noopener noreferrer" })}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      onMouseEnter={play}
      onMouseLeave={reset}
    >
      {content}
    </button>
  );
}
