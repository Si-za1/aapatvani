// Bucketing the timeline into days, weeks or months.
//
// Pure, and kept out of the service so it can be tested without a store. The dates are read in the
// region's own time zone: a report that arrived at 00:30 in Kathmandu belongs to that day even
// though it is still the previous afternoon in UTC, and a grouping that quietly used the server's
// clock would put it in the wrong bucket on a Cloud Run machine in Mumbai.

import type { TimelineEntry } from "./types";

export type Granularity = "day" | "week" | "month";

export const GRANULARITIES: Array<{ value: Granularity; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export interface TimelineGroup {
  key: string;
  label: string;
  entries: TimelineEntry[];
}

/** A calendar date in a time zone, as three numbers. No Date arithmetic on the wall clock. */
interface LocalDate {
  y: number;
  m: number;
  d: number;
}

function localDate(iso: string, timeZone: string): LocalDate | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  if (!y || !m || !d) return null;
  return { y, m, d };
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (date: LocalDate) => `${date.y}-${pad(date.m)}-${pad(date.d)}`;
const monthKey = (date: LocalDate) => `${date.y}-${pad(date.m)}`;

// Day arithmetic on a UTC clock: the numbers are already local, so counting days this way cannot
// drift across a time zone or a daylight-saving boundary.
const toEpochDay = (date: LocalDate) => Date.UTC(date.y, date.m - 1, date.d) / 86_400_000;
const fromEpochDay = (days: number): LocalDate => {
  const at = new Date(days * 86_400_000);
  return { y: at.getUTCFullYear(), m: at.getUTCMonth() + 1, d: at.getUTCDate() };
};
const addDays = (date: LocalDate, days: number) => fromEpochDay(toEpochDay(date) + days);

/** The Monday of the week a date falls in, because a relief shift thinks in weeks that start Monday. */
function weekStart(date: LocalDate): LocalDate {
  const at = new Date(toEpochDay(date) * 86_400_000);
  return addDays(date, -((at.getUTCDay() + 6) % 7));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDay(date: LocalDate): string {
  return `${date.d} ${MONTHS[date.m - 1]} ${date.y}`;
}

function formatWeek(start: LocalDate): string {
  const end = new Date(Date.UTC(start.y, start.m - 1, start.d + 6));
  const endDate = { y: end.getUTCFullYear(), m: end.getUTCMonth() + 1, d: end.getUTCDate() };
  if (start.y !== endDate.y) return `${formatDay(start)} – ${formatDay(endDate)}`;
  if (start.m !== endDate.m) return `${start.d} ${MONTHS[start.m - 1]} – ${formatDay(endDate)}`;
  return `${start.d}–${formatDay(endDate)}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function shiftMonth(date: LocalDate, months: number): LocalDate {
  const at = new Date(Date.UTC(date.y, date.m - 1 + months, 1));
  return { y: at.getUTCFullYear(), m: at.getUTCMonth() + 1, d: 1 };
}

/**
 * Groups entries, newest group first, keeping the service's newest-first order inside each group.
 * The first three labels are spoken rather than dated, because "Today" is easier to read than a date
 * and the reader already knows what day it is.
 */
export function groupEntries(
  entries: TimelineEntry[],
  granularity: Granularity,
  now: string,
  timeZone = "Asia/Kathmandu",
): TimelineGroup[] {
  const today = localDate(now, timeZone);
  const yesterdayKey = today ? dayKey(addDays(today, -1)) : null;
  const thisWeek = today ? weekStart(today) : null;
  const lastWeekKey = thisWeek ? dayKey(addDays(thisWeek, -7)) : null;

  const groups = new Map<string, TimelineGroup>();

  for (const entry of entries) {
    const date = localDate(entry.at, timeZone);
    if (!date) continue;

    let key: string;
    let label: string;

    if (granularity === "day") {
      key = dayKey(date);
      label =
        today && key === dayKey(today)
          ? "Today"
          : yesterdayKey && key === yesterdayKey
            ? "Yesterday"
            : formatDay(date);
    } else if (granularity === "week") {
      const start = weekStart(date);
      key = dayKey(start);
      label =
        thisWeek && key === dayKey(thisWeek)
          ? "This week"
          : lastWeekKey && key === lastWeekKey
            ? "Last week"
            : formatWeek(start);
    } else {
      key = monthKey(date);
      label =
        today && key === monthKey(today)
          ? "This month"
          : today && key === monthKey(shiftMonth(today, -1))
            ? "Last month"
            : `${MONTH_NAMES[date.m - 1]} ${date.y}`;
    }

    const existing = groups.get(key);
    if (existing) existing.entries.push(entry);
    else groups.set(key, { key, label, entries: [entry] });
  }

  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}
