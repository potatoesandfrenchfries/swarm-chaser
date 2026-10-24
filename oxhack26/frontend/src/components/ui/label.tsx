import * as React from "react";

import { cn } from "~/lib/utils";

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("label font-medium leading-none", className)}
      {...props}
    />
  );
}
