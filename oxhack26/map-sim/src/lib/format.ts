/**
 * A change in journey time, signed. One new node moves a network-wide average by
 * fractions of a minute, so anything under a minute is shown in seconds.
 */
export function formatChange(minutes: number): string {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  return abs < 1 ? `${sign}${(abs * 60).toFixed(1)} s` : `${sign}${abs.toFixed(2)} min`;
}

/** An unsigned duration, same units rule. */
export const formatDuration = (minutes: number) => formatChange(Math.abs(minutes)).replace(/^[+-]/, "");

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
