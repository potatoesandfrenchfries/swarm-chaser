"use client";

import { Toaster as Sonner } from "sonner";

/** Dark toasts, bottom-centre. Success is green, error is red. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      toastOptions={{
        className: "!rounded-none !border-none !bg-foreground !text-background",
        classNames: {
          success: "!bg-success !text-white",
          error: "!bg-destructive !text-white",
        },
      }}
    />
  );
}
