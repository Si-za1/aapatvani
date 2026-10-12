// The reviewer shell (project.md §3): deep pine-teal "ink" down the side, warm cream content.
//
// A sidebar on a laptop, a horizontal strip on a phone — a responder in the field is as likely to
// be on a phone as at a desk, so nothing here assumes width.

import Link from "next/link";
import { Activity, LayoutDashboard, MapPin, Scale } from "lucide-react";
import { SignOutButton } from "@/components/av/sign-out-button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/reports", label: "Reports", Icon: MapPin },
  { href: "/incidents", label: "Incidents", Icon: Scale },
  { href: "/activity", label: "Activity", Icon: Activity },
] as const;

export function AppShell({
  children,
  current,
  reviewer,
}: {
  children: React.ReactNode;
  /** Path prefix that should read as the active section. */
  current: string;
  reviewer: { name: string };
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 bg-sidebar px-4 py-4 text-sidebar-foreground lg:w-60 lg:px-3 lg:py-6">
        <div className="flex items-center justify-between gap-3 lg:px-2">
          <Link href="/dashboard" className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight">AapatVani</span>
            <span lang="ne" className="text-xs text-sidebar-foreground/60">
              आपतवाणी
            </span>
          </Link>
          <span className="hidden text-xs text-sidebar-foreground/60 lg:inline">Reviewer</span>
        </div>

        <nav aria-label="Sections" className="-mx-1 flex gap-1 overflow-x-auto lg:mx-0 lg:flex-col lg:overflow-visible">
          {NAV.map(({ href, label, Icon }) => {
            const active = current === href || current.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-sidebar-border pt-4 lg:px-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{reviewer.name}</p>
            <p className="text-xs text-sidebar-foreground/60">Signed in</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** Page heading with an optional count and action area, shared by the reviewer pages. */
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
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-5 py-5 sm:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
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
