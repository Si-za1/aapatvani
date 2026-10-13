import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import type { Actor, AuditTarget } from "@/lib/domain/schemas";

// What the bell in the top bar rings about.
//
// There is exactly one record of "something happened" in this app: the append-only audit trail
// (feature M5). The bell is a second way of reading the same events, latest first, so a reviewer who
// is watching the map does not have to leave it to notice that a report arrived. It is a view, not a
// second source of truth: nothing is stored here, and the Activity page remains the whole record.
//
// "Unread" is kept in a cookie holding the moment the bell was last opened. That is a reading
// position, not data: losing it costs a reviewer a count, never a record.

export const SEEN_COOKIE = "av_seen";

export interface NotificationItem {
  id: string;
  summary: string;
  actorKind: Actor["kind"];
  actorName?: string;
  at: string;
  href?: string;
}

export interface Notifications {
  items: NotificationItem[];
  /** Events since the bell was last opened, capped so the badge stays a badge. */
  unread: number;
  total: number;
}

/** Signing in is recorded, and shown on the Activity page, but it is not news for the bell. */
const QUIET: AuditTarget[] = ["session"];

export async function recentNotifications(limit = 7): Promise<Notifications> {
  const db = getDb();
  const events = await db.events.list({ orderBy: { field: "at", direction: "desc" } });
  const heard = events.filter((event) => !QUIET.includes(event.targetType));

  const seenAt = (await cookies()).get(SEEN_COOKIE)?.value;
  const seenMs = seenAt ? Date.parse(seenAt) : Number.NaN;
  const since = Number.isNaN(seenMs) ? 0 : seenMs;

  return {
    items: heard.slice(0, limit).map((event) => ({
      id: event.id,
      summary: event.summary,
      actorKind: event.actor.kind,
      actorName: event.actor.name,
      at: event.at,
      href: event.reportId ? `/reports/${event.reportId}` : event.incidentId ? `/incidents/${event.incidentId}` : undefined,
    })),
    unread: heard.filter((event) => Date.parse(event.at) > since).length,
    total: heard.length,
  };
}
