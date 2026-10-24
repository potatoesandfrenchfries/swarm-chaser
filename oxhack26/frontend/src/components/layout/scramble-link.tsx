"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { useScramble } from "~/hooks/use-scramble";
import { cn } from "~/lib/utils";

type ScrambleLinkProps = Omit<ComponentProps<typeof Link>, "children"> & {
  label: string;
  /** `inverse` is for links on dark surfaces (footer, mobile menu). */
  tone?: "default" | "inverse";
};

/**
 * Text link with the site's hover: a solid bar wipes in from the left, the
 * text flips colour and scrambles back into place. Bar + colour are pure CSS;
 * only the scramble uses GSAP.
 */
export function ScrambleLink({
  label,
  tone = "default",
  className,
  ...props
}: ScrambleLinkProps) {
  const { ref, play, reset } = useScramble(label);
  const inverse = tone === "inverse";

  return (
    <Link
      className={cn("group relative isolate inline-block", className)}
      onMouseEnter={play}
      onMouseLeave={reset}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 origin-right scale-x-0 transition-transform duration-200 ease-out group-hover:origin-left group-hover:scale-x-100",
          inverse ? "bg-background" : "bg-foreground"
        )}
      />
      <span
        ref={ref}
        className={cn(
          "relative transition-colors duration-200",
          inverse
            ? "group-hover:text-foreground"
            : "group-hover:text-background"
        )}
      >
        {label}
      </span>
    </Link>
  );
}
