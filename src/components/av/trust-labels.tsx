// The trust model, as labels (project.md §3).
//
// Two things every data point in this app carries: who produced it (origin) and what a person
// decided about it (review status). The house rule is that colour never carries meaning alone, so
// each of these renders an icon and words as well as a tint, a reviewer reading a printed
// screenshot, or with any form of colour blindness, gets the same information.

import {
  Bot,
  Calculator,
  CircleCheck,
  CircleQuestionMark,
  CircleX,
  Clock,
  MessageSquareQuote,
  PencilLine,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Actor, DataLabel, Origin, ReviewStatus } from "@/lib/domain/schemas";

const ORIGIN: Record<Origin, { label: string; className: string; Icon: typeof Bot }> = {
  reporter: { label: "Reported", className: "bg-coral-tint text-coral-strong", Icon: MessageSquareQuote },
  ai: { label: "AI interpretation", className: "bg-violet-tint text-violet-strong", Icon: Bot },
  computed: { label: "Computed", className: "bg-moss-tint text-moss-strong", Icon: Calculator },
  reviewer: { label: "Reviewer", className: "bg-stone-tint text-stone-strong", Icon: UserCheck },
};

/**
 * Who said it. `Reported` means the words are in the reporter's own text, never that they are
 * true, and never that a person has checked them.
 */
export function OriginBadge({ origin, className }: { origin: Origin; className?: string }) {
  const { label, className: tone, Icon } = ORIGIN[origin] ?? ORIGIN.ai;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tone, className)}
      title={`Origin: ${label}`}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

/**
 * Who did it, for the records that carry an actor rather than an origin: an audit event, a timeline
 * entry, a notification. The two vocabularies name the same four producers, and this is the only
 * place that says so, so the activity trail, the bell and the timeline cannot drift apart.
 */
export const ACTOR_TONE: Record<Actor["kind"], { label: string; className: string; Icon: typeof Bot }> = {
  public: { label: ORIGIN.reporter.label, className: ORIGIN.reporter.className, Icon: ORIGIN.reporter.Icon },
  ai: { label: ORIGIN.ai.label, className: ORIGIN.ai.className, Icon: ORIGIN.ai.Icon },
  system: { label: ORIGIN.computed.label, className: ORIGIN.computed.className, Icon: ORIGIN.computed.Icon },
  human: { label: ORIGIN.reviewer.label, className: ORIGIN.reviewer.className, Icon: ORIGIN.reviewer.Icon },
};

export function actorTone(kind: Actor["kind"]) {
  return ACTOR_TONE[kind] ?? ACTOR_TONE.system;
}

/** The same badge as OriginBadge, for a record that knows its actor instead of its origin. */
export function ActorBadge({
  actor,
  name,
  className,
}: {
  actor: Actor["kind"];
  /** Who, by name, when the record knows. Shown after the kind, quietly. */
  name?: string;
  className?: string;
}) {
  const { label, className: tone, Icon } = actorTone(actor);
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tone, className)}
      title={name ? `${label} · ${name}` : `Origin: ${label}`}
    >
      <Icon className="size-3" aria-hidden />
      {label}
      {name ? <span className="font-normal opacity-75">· {name}</span> : null}
    </span>
  );
}

const REVIEW: Record<ReviewStatus, { label: string; className: string; Icon: typeof Bot }> = {
  unreviewed: { label: "Awaiting review", className: "bg-amber-tint text-amber-strong", Icon: Clock },
  confirmed: { label: "Confirmed", className: "bg-leaf-tint text-leaf-strong", Icon: CircleCheck },
  edited: { label: "Edited", className: "bg-leaf-tint text-leaf-strong", Icon: PencilLine },
  rejected: { label: "Rejected", className: "bg-stone-tint text-stone-strong", Icon: CircleX },
  needs_info: { label: "Needs information", className: "bg-amber-tint text-amber-strong", Icon: CircleQuestionMark },
};

/**
 * What a person decided. "Confirmed" only ever appears after a named reviewer acts, which is why
 * this badge and the audit trail are the two places that word is allowed to come from.
 */
export function ReviewBadge({
  status,
  by,
  className,
}: {
  status: ReviewStatus;
  by?: string;
  className?: string;
}) {
  const { label, className: tone, Icon } = REVIEW[status] ?? REVIEW.unreviewed;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tone, className)}
      title={by ? `${label} by ${by}` : label}
    >
      <Icon className="size-3" aria-hidden />
      {label}
      {by ? <span className="font-normal opacity-75">· {by}</span> : null}
    </span>
  );
}

const DATA_LABEL: Record<DataLabel, { label: string; className: string }> = {
  synthetic: { label: "Synthetic", className: "bg-flame-tint text-flame-strong" },
  historical: { label: "Historical", className: "bg-violet-tint text-violet-strong" },
  operational: { label: "Operational", className: "bg-leaf-tint text-leaf-strong" },
};

/**
 * Whether the data is made up. The demo runs on synthetic reports over real geography, and the
 * label says so wherever a record is shown.
 */
export function DataLabelBadge({ label: value, className }: { label: DataLabel; className?: string }) {
  const { label, className: tone } = DATA_LABEL[value] ?? DATA_LABEL.synthetic;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tone, className)}>
      {label}
    </span>
  );
}

/** A count with a word, for the dashboard tiles and list headers. */
export function CountPill({ label, value, tone = "bg-sand text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", tone)}>
      <span className="font-semibold tabular-nums">{value}</span>
      {label}
    </span>
  );
}
