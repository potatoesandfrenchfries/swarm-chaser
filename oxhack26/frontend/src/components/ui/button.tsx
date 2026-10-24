import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "~/lib/utils";

/**
 * Square, flat, high-contrast. No radius, no shadow. For the signature
 * chamfered CTA see ChamferButton.
 */
const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background hover:bg-foreground/80",
        outline: "border border-border bg-background hover:bg-muted",
        ghost: "hover:bg-muted",
        link: "underline-offset-4 hover:underline",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
      },
      size: {
        default: "px-4 py-2",
        sm: "px-3 py-1 text-xs",
        lg: "px-8 py-3",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { buttonVariants };
