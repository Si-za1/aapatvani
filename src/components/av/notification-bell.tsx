"use client";

// The bell in the top bar: what has happened lately, without leaving the screen you are on.
//
// It reads the same append-only trail the Activity page does, latest first, so the two can never
// disagree. Opening it moves the reading position forward, which is a cookie and nothing more: the
// events themselves are untouched, and the Activity page still shows every one of them in order.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell as BellIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActorBadge, actorTone } from "@/components/av/trust-labels";
import type { Notifications } from "@/lib/notifications";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export function NotificationBell({ notifications }: { notifications: Notifications }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(notifications.unread);
  const marked = useRef(false);

  function markSeen() {
    if (marked.current || unread === 0) return;
    marked.current = true;
    setUnread(0);
    void fetch("/api/notifications/seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).then(() => router.refresh());
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) markSeen();
      }}
    >
      <PopoverTrigger
        title="What has happened lately"
        className="relative grid size-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <BellIcon className="size-[17px]" aria-hidden />
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 grid min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground tabular-nums ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
        <span className="sr-only">
          {unread > 0 ? `${unread} new since you last looked` : "What has happened lately"}
        </span>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] gap-0 p-0">
        <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3">
          <p className="text-sm font-semibold">Lately</p>
          <p className="text-xs text-muted-foreground">
            {notifications.total} event{notifications.total === 1 ? "" : "s"} on record
          </p>
        </div>

        {notifications.items.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            Nothing has happened yet. A report arriving, being read, or being checked all appear here.
          </p>
        ) : (
          <ul className="flex max-h-[22rem] flex-col overflow-y-auto px-1.5 pb-1.5">
            {notifications.items.map((item) => {
              const tone = actorTone(item.actorKind);
              const body = (
                <>
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                      tone.className,
                    )}
                    aria-hidden
                  >
                    <tone.Icon className="size-3" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] leading-snug">{item.summary}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <ActorBadge actor={item.actorKind} name={item.actorName} />
                      {relativeTime(item.at)}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-accent"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-2.5 px-2.5 py-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-border px-4 py-2.5">
          <Link
            href="/activity"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
Open the whole activity trail
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
