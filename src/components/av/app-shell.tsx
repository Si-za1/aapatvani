// The reviewer shell.
//
// Two pieces of furniture, and the rest is the page.
//
// On the left, a narrow rail: the mark and the name at the top, then one icon per destination, and
// the reviewer's own menu at the foot. Five destinations do not need a column of words competing
// with the data, and every icon carries its name as a tooltip and to screen readers, so nothing here
// is a guess. It is the deep ink of the palette, which is the one large dark surface in the app and
// marks where the responder side begins.
//
// Along the top, one bar that holds everything which is not a destination: what region this
// deployment is watching, what the bell has heard, and where settings live. The bell is a view of
// the audit trail, not a second record of it.
//
// On a phone the rail turns into a horizontal strip, because a responder in the field is as likely
// to be holding a phone as sitting at a desk.

import Link from "next/link";
import { Suspense } from "react";
import { History, Inbox, Layers, LayoutDashboard, MapPin, Settings, SlidersVertical } from "lucide-react";
import { Logo } from "@/components/av/logo";
import { NotificationBell } from "@/components/av/notification-bell";
import { ProfileMenu } from "@/components/av/profile-menu";
import { DataLabelBadge } from "@/components/av/trust-labels";
import { getRegion } from "@/config/regions";
import type { Reviewer } from "@/lib/auth";
import { loadManifest } from "@/lib/geo/dataset";
import { getEnv } from "@/lib/env";
import { recentNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", Icon: LayoutDashboard },
  { href: "/reports", label: "Reports", Icon: Inbox },
  { href: "/incidents", label: "Incidents", Icon: Layers },
  { href: "/timeline", label: "Timeline", Icon: SlidersVertical },
  { href: "/activity", label: "Activity", Icon: History },
] as const;

/** One reading column for every reviewer page, so the pages agree about where the edges are. */
const COLUMN = "mx-auto w-full max-w-[86rem] px-5 sm:px-8";

export async function AppShell({
  children,
  current,
  reviewer,
}: {
  children: React.ReactNode;
  /** Path prefix that should read as the active section. */
  current: string;
  reviewer: Reviewer;
}) {
  const env = getEnv();
  const region = getRegion(env.defaultRegionId);
  const manifest = await loadManifest(region.datasetIds[0]);

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* On a phone the strip is pinned and so is the bar under it, so the bar starts where the
            strip ends: two stacked headers that both claim the top of the screen would hide one of
            them the moment anyone scrolled. The strip has an explicit height for that reason. */}
      <aside className="sticky top-0 z-40 flex h-[3.25rem] shrink-0 items-center gap-1.5 bg-sidebar px-3 text-sidebar-foreground lg:h-screen lg:w-[5.5rem] lg:flex-col lg:gap-2 lg:px-3 lg:py-5">
        {/* The mark and the name together, stacked, because a rail this narrow has no room for a
            wordmark beside anything. The name is the one piece of type in the rail: everything else
            is an icon with a name attached. */}
        <Link
          href="/dashboard"
          className="mr-1 flex shrink-0 flex-col items-center gap-1.5 lg:mr-0"
          title="AapatVani"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-leaf text-leaf-strong">
            <Logo className="size-6" />
          </span>
          <span className="hidden text-[10px] leading-none font-bold tracking-tight lg:block">AapatVani</span>
        </Link>

        <nav
          aria-label="Sections"
          className="flex flex-1 items-center gap-1 overflow-x-auto lg:mt-5 lg:flex-col lg:gap-2 lg:overflow-visible"
        >
          {NAV.map(({ href, label, Icon }) => {
            const active = current === href || current.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                title={label}
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-xl transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                <span className="sr-only">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="lg:mt-auto">
          <ProfileMenu reviewer={reviewer} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-[3.25rem] z-30 border-b border-border/70 bg-background/85 backdrop-blur-sm lg:top-0">
          <div className={cn(COLUMN, "flex items-center justify-between gap-4 py-2.5")}>
            {/* Where this deployment is looking, and whether what it is looking at is real.
                Both are constant, so they live in the chrome rather than on any one page. */}
            <p className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{manifest?.name ?? region.name}</span>
              <span aria-hidden className="text-border">
                |
              </span>
              <DataLabelBadge label={env.defaultDataLabel} />
            </p>

            <div className="flex items-center gap-1.5 sm:ml-auto">
              <Suspense fallback={<BellPlaceholder />}>
                <Bell />
              </Suspense>
              <Link
                href="/settings"
                title="Settings"
                className="grid size-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Settings className="size-[17px]" aria-hidden />
                <span className="sr-only">Settings</span>
              </Link>
            </div>
          </div>
        </div>

        <main className={cn(COLUMN, "flex flex-1 flex-col pb-12")}>{children}</main>
      </div>
    </div>
  );
}

function BellPlaceholder() {
  return <span className="size-9 rounded-full border border-border bg-card" aria-hidden />;
}

/** Server half of the bell: reads the trail, hands the client what it needs to draw. */
async function Bell() {
  const notifications = await recentNotifications();
  return <NotificationBell notifications={notifications} />;
}

/**
 * The page heading. Big and quiet: one title, one line of explanation, and any controls pushed to
 * the right edge so the reading column stays intact.
 */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-7 pb-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] sm:text-[32px]">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

/** A quiet placeholder for sections that arrive in a later chunk, so nothing looks broken. */
export function ComingSoon({ what, chunk }: { what: string; chunk: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
      {what} arrives in {chunk}. The data behind it is already built and tested.
    </p>
  );
}
