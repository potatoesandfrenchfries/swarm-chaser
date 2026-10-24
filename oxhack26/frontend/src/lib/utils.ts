import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 1 -> "01". Used for FAQ rows, sponsor cards and step counters. */
export const pad2 = (n: number) => String(n).padStart(2, "0");
