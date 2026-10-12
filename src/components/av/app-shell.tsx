// The reviewer shell.
//
// A narrow, icon-only rail rather than a labelled sidebar: four destinations do not need a column
// of words competing with the data, and the icons are recognisable after one pass. The active
// destination is a light rounded square, which is the only strong shape in the rail.
//
// On a phone the rail turns into a horizontal strip, because a responder in the field is as likely
// to be holding a phone as sitting at a desk.

import Link from "next/link";
import { Activity, LayoutDashboard, MapPin, Scale } from "lucide-react";
import { Logo } from "@/components/av/logo";
import { SignOutButton } from "@/components/av/sign-out-button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", Icon: LayoutDashboard },
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
      <aside className="flex shrink-0 items-center gap-1 bg-sidebar px-3 py-2 text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen lg:w-[5.5rem] lg:flex-col lg:gap-2 lg:px-3 lg:py-5">
        {/* The mark and the name together, stacked, because a rail this narrow has no room for a
            wordmark beside anything. The name is the one piece of type in the rail: everything else
            is an icon with a tooltip. */}
        <Link href="/dashboard" className="mr-1 hidden shrink-0 flex-col items-center gap-1.5 lg:flex">
          <span className="grid size-10 place-items-center rounded-xl bg-leaf text-leaf-strong">
            <Logo className="size-6" />
          </span>
          <span className="text-[10px] leading-none font-bold tracking-tight">AapatVani</span>
        </Link>

        <nav
          aria-label="Sections"
          className="flex flex-1 items-center gap-1 overflow-x-auto lg:mt-4 lg:flex-col lg:gap-2 lg:overflow-visible"
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

        <div className="flex shrink-0 items-center gap-1 lg:mt-auto lg:flex-col lg:gap-2">
          <span
            className="hidden size-10 place-items-center rounded-xl bg-sidebar-accent text-sm font-semibold text-sidebar-accent-foreground lg:grid"
            title={reviewer.name}
          >
            {reviewer.name.slice(0, 1).toUpperCase()}
          </span>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
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
    <header className="flex flex-wrap items-start justify-between gap-4 px-6 pt-8 pb-6 sm:px-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
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
