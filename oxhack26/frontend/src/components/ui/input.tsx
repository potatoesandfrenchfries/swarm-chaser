import * as React from "react";

import { cn } from "~/lib/utils";

export const fieldClasses =
  "w-full border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldClasses, "h-10", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea className={cn(fieldClasses, "min-h-28", className)} {...props} />
  );
}
