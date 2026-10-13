// The reviewer's two preferences, as data.
//
// Kept apart from lib/prefs.ts, which reads cookies and is therefore server-only: the settings form
// is a Client Component and needs the same choices the server validates against, and a list written
// out twice is a list that will disagree with itself.

export const WINDOW_CHOICES = [
  { value: "all", label: "Any time", hours: 0 },
  { value: "24", label: "Last 24 hours", hours: 24 },
  { value: "72", label: "Last 3 days", hours: 72 },
  { value: "168", label: "Last 7 days", hours: 168 },
] as const;

export const QUEUE_CHOICES = [
  { value: "awaiting", label: "Waiting for a person", hint: "Reports that have been read and not yet checked." },
  {
    value: "unread",
    label: "Not read yet",
    hint: "Reports the model has not been through, which is every report on a deployment without Gemini.",
  },
  { value: "all", label: "Everything", hint: "Every report, whatever state it is in." },
] as const;

export type QueueChoice = (typeof QUEUE_CHOICES)[number]["value"];

export interface ReviewerPrefs {
  /** The window the overview opens on. 0 means no window at all. */
  windowHours: number;
  /** Which slice of the review queue opens by default. */
  queue: QueueChoice;
}

export const DEFAULT_PREFS: ReviewerPrefs = { windowHours: 0, queue: "awaiting" };

/**
 * Reads a preferences cookie. Anything unrecognised falls back to the default rather than throwing:
 * a stale cookie from an older build should cost someone a click, never a page.
 */
export function parsePrefs(raw: string | undefined): ReviewerPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFS;
    const record = parsed as Record<string, unknown>;
    const hours = record.windowHours;
    const queue = record.queue;
    return {
      windowHours:
        typeof hours === "number" && WINDOW_CHOICES.some((choice) => choice.hours === hours) ? hours : 0,
      queue: QUEUE_CHOICES.some((choice) => choice.value === queue) ? (queue as QueueChoice) : "awaiting",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}
