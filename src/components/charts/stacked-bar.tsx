// Part-to-whole, as one bar.
//
// A stacked bar rather than a ring of slices: the question this answers is "how much of the record is
// a person's and how much is a machine's", which is a share of a whole, and shares are easier to
// compare along a line than around a circle.
//
// The colours are the chart tokens, which are stepped for marks and validated for colour-vision
// separation (see globals.css). Every series is also named and counted underneath, so identity never
// rests on the colour alone, and each segment carries its own figure on hover.

import { cn } from "@/lib/utils";

export interface Slice {
  key: string;
  label: string;
  value: number;
  /** A chart token: --chart-1 … --chart-4, in fixed order. */
  color: string;
  /** What this producer is, for the legend line under the name. */
  hint?: string;
}

export function StackedBar({
  slices,
  total,
  unit,
  className,
}: {
  slices: Slice[];
  total: number;
  /** What the number counts, singular-friendly: "event" reads as "12 events". */
  unit: string;
  className?: string;
}) {
  const present = slices.filter((slice) => slice.value > 0);

  return (
    <div className={cn("flex flex-col", className)}>
      <p className="text-[32px] leading-none font-bold tracking-tight tabular-nums">{total}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {unit}
        {total === 1 ? "" : "s"} on record
      </p>

      {/* The 2px gaps are the surface showing through, which is what keeps two adjacent fills from
          reading as one. */}
      <div
        className="mt-4 flex h-3 gap-0.5"
        role="img"
        aria-label={present.map((slice) => `${slice.label}: ${slice.value}`).join(", ")}
      >
        {present.map((slice, index) => (
          <span
            key={slice.key}
            title={`${slice.label} · ${slice.value} of ${total}`}
            className={cn(
              "h-full",
              index === 0 && "rounded-l-full",
              index === present.length - 1 && "rounded-r-full",
            )}
            style={{ width: `${(slice.value / Math.max(total, 1)) * 100}%`, background: slice.color }}
          />
        ))}
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {slices.map((slice) => {
          const share = total > 0 ? Math.round((slice.value / total) * 100) : 0;
          return (
            <li key={slice.key} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={cn("mt-[3px] size-2.5 shrink-0 rounded-[3px]", slice.value === 0 && "opacity-40")}
                style={{ background: slice.color }}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-semibold">{slice.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {slice.value} · {share}%
                  </span>
                </span>
                {slice.hint ? (
                  <span className="text-[11px] leading-snug text-muted-foreground">{slice.hint}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
