import { cn } from "~/lib/utils";

/**
 * Four tracks that weave and settle into the straight stripes at the inner
 * edge. Each entry: stripe index (final lane 1..4), starting lane, and where
 * along x the bend happens. Lane centres sit at y = 15, 45, 75, 105 in a
 * 400x120 box so they join <Stripes/> exactly (4 bands x 30px).
 */
const LANE_Y = [15, 45, 75, 105] as const;

const WEAVES = {
  // lanes the tracks enter from at the outer edge, per stripe 1..4
  left: [
    { stripe: 4, from: 1, bend: 150 },
    { stripe: 3, from: 3, bend: 120 },
    { stripe: 2, from: 0, bend: 190 },
    { stripe: 1, from: 2, bend: 90 },
  ],
  right: [
    { stripe: 4, from: 2, bend: 110 },
    { stripe: 3, from: 0, bend: 170 },
    { stripe: 2, from: 3, bend: 130 },
    { stripe: 1, from: 1, bend: 200 },
  ],
} as const;

const track = (from: number, to: number, bend: number) => {
  const y0 = LANE_Y[from] ?? 15;
  const y1 = LANE_Y[to] ?? 15;
  // S-curve between lanes; straight on either side
  return `M-20 ${y0}H${bend}C${bend + 70} ${y0} ${bend + 70} ${y1} ${bend + 140} ${y1}H420`;
};

export function TrackEnd({
  side,
  className,
}: {
  side: "left" | "right";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none relative block max-w-[760px] self-stretch overflow-hidden bg-background",
        className
      )}
    >
      <svg
        viewBox="0 0 400 120"
        preserveAspectRatio="none"
        fill="none"
        focusable="false"
        // the right end is the left end mirrored, so tracks head outward
        className={cn(
          "absolute inset-0 size-full",
          side === "right" && "-scale-x-100"
        )}
      >
        {WEAVES[side].map(({ stripe, from, bend }) => (
          <path
            key={stripe}
            d={track(from, stripe - 1, bend)}
            strokeWidth={30}
            strokeLinejoin="round"
            style={{ stroke: `var(--stripe-${stripe})` }}
          />
        ))}
      </svg>
    </span>
  );
}
