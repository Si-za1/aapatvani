// Time formatting. Stored times are ISO-8601 UTC; display uses the region's time zone.

export function formatDateTime(iso: string | undefined, timeZone = "Asia/Kathmandu"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatTime(iso: string | undefined, timeZone = "Asia/Kathmandu"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso),
  );
}

export function formatDate(iso: string | undefined, timeZone = "Asia/Kathmandu"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

/**
 * "3 h ago", relative to a reference moment that defaults to now. The default lives here rather than
 * at the call site so that server components can render it without reading the clock mid-render.
 */
export function relativeTime(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const diff = now - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const suffix = diff >= 0 ? "ago" : "from now";
  if (abs < minute) return "just now";
  if (abs < hour) return `${Math.round(abs / minute)} min ${suffix}`;
  if (abs < day) return `${Math.round(abs / hour)} h ${suffix}`;
  return `${Math.round(abs / day)} d ${suffix}`;
}

export function hoursBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3_600_000;
}
