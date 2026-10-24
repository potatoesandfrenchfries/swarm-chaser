"use client";

import { useSyncExternalStore } from "react";

import { cn } from "~/lib/utils";

const noop = () => {};
const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// One shared 1s clock. With reduced motion it never ticks (renders once).
const subscribe = (onTick: () => void) => {
  if (reduced()) return noop;
  const id = window.setInterval(onTick, 1000);
  return () => window.clearInterval(id);
};
const now = () => Math.floor(Date.now() / 1000);
const server = () => null;

const UNITS = [
  { key: "days", label: "Days", colour: "var(--stripe-4)" },
  { key: "hours", label: "Hours", colour: "var(--stripe-3)" },
  { key: "minutes", label: "Minutes", colour: "var(--stripe-2)" },
  { key: "seconds", label: "Seconds", colour: "var(--stripe-1)" },
] as const;

/**
 * Four big numerals coloured days→seconds with the palette (darkest to
 * lightest). Server and first client render are blank (`invisible`) so there
 * is no hydration mismatch; it fills in on mount.
 */
export function Countdown({ target }: { target: string }) {
  const seconds = useSyncExternalStore(subscribe, now, server);
  const remaining =
    seconds === null
      ? 0
      : Math.max(0, new Date(target).getTime() / 1000 - seconds);

  const values = {
    days: Math.floor(remaining / 86400),
    hours: Math.floor((remaining % 86400) / 3600),
    minutes: Math.floor((remaining % 3600) / 60),
    seconds: Math.floor(remaining % 60),
  };

  return (
    <div
      role="timer"
      aria-label={`${values.days} days, ${values.hours} hours, ${values.minutes} minutes and ${values.seconds} seconds to go`}
      className={cn(
        "mt-7 grid grid-cols-4 gap-3 min-[901px]:flex min-[901px]:items-baseline min-[901px]:gap-12",
        seconds === null && "invisible"
      )}
    >
      {UNITS.map(({ key, label, colour }) => (
        <span
          key={key}
          className="flex flex-col items-start gap-2 min-[901px]:flex-row min-[901px]:items-baseline min-[901px]:gap-4"
        >
          <strong
            className="text-[clamp(36px,7vw,52px)] font-bold tabular-nums leading-[1.2] min-[901px]:text-[64px]"
            style={{ color: colour }}
          >
            {values[key]}
          </strong>
          <span className="text-[15px] leading-none min-[901px]:text-xl">
            {label}
          </span>
        </span>
      ))}
    </div>
  );
}
