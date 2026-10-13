// Before and after, one row per place.
//
// This is the shape of a road-access finding: every settlement had a route to care of some length,
// and after the assumed blockage it has a longer one or none at all. Two dots on one shared scale
// per row, joined by a line whose length *is* the harm, which is the one thing a list of sentences
// makes the reader work out for themselves.
//
// One hue in two shades, as the form calls for: the pale dot is the road as it was, the solid dot
// the road as it would be. Where there is no route left, the line breaks and the row says so in
// words, because "the dot is at the end of the scale" is not something to make anyone infer.
//
// The scale is shared across every row, so the bars can be compared; the numbers are printed at the
// end of each row, so nothing depends on reading a position off an axis.


export interface DumbbellRow {
  key: string;
  label: string;
  /** Metres by road before the assumed blockage. Null when there was no mapped route to begin with. */
  beforeM: number | null;
  /** Metres after. Null means no route at all, which is the finding this chart exists to show. */
  afterM: number | null;
  /** A facility name, a distance, anything worth a second line. */
  detail?: string;
}

function km(metres: number): string {
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

export function Dumbbell({ rows, before, after }: { rows: DumbbellRow[]; before: string; after: string }) {
  const longest = Math.max(...rows.flatMap((row) => [row.beforeM ?? 0, row.afterM ?? 0]), 1);

  return (
    <div className="flex flex-col gap-3">
      {/* The two shades, named once, so the row is readable without a key beside every dot. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-[var(--av-moss)]" />
          {before}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-[var(--av-moss-strong)]" />
          {after}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-px w-4 border-t border-dashed border-flame" />
          No mapped route left
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const lost = row.afterM === null;
          const start = row.beforeM ?? 0;
          const end = row.afterM ?? start;
          const left = (Math.min(start, end) / longest) * 100;
          const right = (Math.max(start, end) / longest) * 100;

          return (
            <li key={row.key} className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[9rem_1fr]">
              <span className="min-w-0 text-xs font-semibold">
                <span className="block truncate">{row.label}</span>
                {row.detail ? (
                  <span className="block truncate text-[11px] font-normal text-muted-foreground">{row.detail}</span>
                ) : null}
              </span>

              <span className="flex min-w-0 flex-col gap-1">
                <span className="relative block h-4">
                  {/* The track: the full scale, so an empty stretch of this row reads as distance. */}
                  <span aria-hidden className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-border" />
                  {/* The line between the two dots, whose length is the harm. Where nothing is left,
                      it breaks a fixed short distance past the dot, so every lost row looks the same
                      however far along the scale it started. */}
                  {lost ? (
                    <span
                      aria-hidden
                      className="absolute top-1/2 h-px -translate-y-1/2 border-t-2 border-dashed border-flame"
                      style={{ left: `${left}%`, width: "1.75rem" }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-[var(--av-moss-strong)]"
                      style={{ left: `${left}%`, width: `${Math.max(right - left, 0)}%` }}
                    />
                  )}

                  {row.beforeM !== null ? (
                    <span
                      title={`${before}: ${km(row.beforeM)}`}
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--av-moss)] ring-2 ring-card"
                      style={{ left: `${(row.beforeM / longest) * 100}%` }}
                    />
                  ) : null}

                  {lost ? (
                    <span
                      aria-hidden
                      title="No mapped route left"
                      className="absolute top-1/2 grid size-3.5 -translate-y-1/2 place-items-center rounded-full bg-flame text-[9px] leading-none font-bold text-white ring-2 ring-card"
                      style={{ left: `calc(${left}% + 1.75rem)` }}
                    >
                      ×
                    </span>
                  ) : (
                    <span
                      title={`${after}: ${km(row.afterM ?? 0)}`}
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--av-moss-strong)] ring-2 ring-card"
                      style={{ left: `${((row.afterM ?? 0) / longest) * 100}%` }}
                    />
                  )}
                </span>

                {/* The numbers, in words. A position on a scale is a shape; this is the fact. */}
                <span className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground tabular-nums">
                  <span>{row.beforeM === null ? "no route before" : km(row.beforeM)}</span>
                  <span aria-hidden>→</span>
                  {lost ? (
                    <span className="font-semibold text-flame-strong">no mapped route</span>
                  ) : (
                    <span className="font-semibold text-foreground">{row.afterM === null ? "-" : km(row.afterM)}</span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
