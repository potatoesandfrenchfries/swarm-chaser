import { cn } from "~/lib/utils";
import { Container } from "./container";

/**
 * Anchor target for a landing-page section. `id` must match an entry in
 * NAV_LINKS ("/#id"). `scroll-mt-*` keeps the heading clear of the navbar.
 */
export function Section({
  id,
  className,
  containerClassName,
  bare = false,
  children,
}: {
  id: string;
  className?: string;
  containerClassName?: string;
  /** Skip the Container wrapper (for full-bleed sections). */
  bare?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-24 md:scroll-mt-28 2xl:scroll-mt-40", className)}
    >
      {bare ? (
        children
      ) : (
        <Container className={containerClassName}>{children}</Container>
      )}
    </section>
  );
}
