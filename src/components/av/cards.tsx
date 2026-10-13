// The two cards the responder side is built from.
//
// A card here is a white surface on the warm page with no border and no shadow until you touch it:
// the page is a shade darker than the card, which is what makes the card read as a card. Nothing
// floats, nothing is outlined, and the only strong colour on a card is the one thing it is about.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A titled block of content. The header carries the title, an optional count or note beside it, and
 * an optional way out, which is always a link rather than a button, because it goes somewhere.
 */
export function SectionCard({
  title,
  note,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  /** A quiet count or caveat, set beside the title. */
  note?: React.ReactNode;
  /** Usually a "See all" link. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-3xl bg-card p-5", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-base font-bold tracking-tight">{title}</h2>
          {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
        </div>
        {action}
      </header>
      <div className={cn("flex flex-col", bodyClassName)}>{children}</div>
    </section>
  );
}

/** The "See all" affordance: a quiet link with a nudge, never a button. */
export function SeeAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
      <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
    </Link>
  );
}

/**
 * One number, in words. The colour lives in the icon's tile rather than in the card, so four of
 * these in a row read as a set instead of four competing blocks, and the number stays the loudest
 * thing in the card.
 */
export function StatCard({
  href,
  icon: Icon,
  value,
  label,
  hint,
  tone,
}: {
  href: string;
  icon: typeof ArrowUpRight;
  value: number;
  label: string;
  hint: string;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3.5 rounded-3xl bg-card p-5 transition-shadow hover:shadow-[0_10px_30px_-12px_rgba(28,31,24,0.18)]"
    >
      <span className="flex items-start justify-between gap-2">
        <span className={cn("grid size-10 place-items-center rounded-2xl", tone)} aria-hidden>
          <Icon className="size-[18px]" />
        </span>
        <ArrowUpRight
          className="size-4 text-border transition-colors group-hover:text-muted-foreground"
          aria-hidden
        />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-[30px] leading-none font-bold tracking-tight tabular-nums">{value}</span>
        <span className="text-sm font-semibold">{label}</span>
      </span>
      <span className="text-xs leading-snug text-muted-foreground">{hint}</span>
    </Link>
  );
}
