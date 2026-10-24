import { cn } from "~/lib/utils";
import { BulletLabel } from "./bullet-label";

export function SectionHeader({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle: string;
  className?: string;
}) {
  return (
    <div className={cn("px-4", className)}>
      <h2 className="-ml-1 font-display text-5xl font-bold md:text-6xl">
        {title}
      </h2>
      <BulletLabel className="pt-1 sm:mt-2">{subtitle}</BulletLabel>
    </div>
  );
}
