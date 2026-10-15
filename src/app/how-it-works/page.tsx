import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BellOff,
  Calculator,
  CircleCheck,
  GitCompareArrows,
  MapPinned,
  Mic,
  PenLine,
  Route,
  ScanText,
  Sparkles,
  TriangleAlert,
  UserRoundCheck,
} from "lucide-react";

// How the system works, for anyone evaluating it rather than using it.
//
// English on purpose: this is a submission artefact, and the hackathon requires all submission
// material in English. The screens a reporter uses stay bilingual, because those are read by people
// deciding whether to trust this with a report about their own road.
//
// The page is built out of the trust palette, so reading it teaches the colour system by using it.
// Coral is what a person reported. Violet is what the model read. Moss is what code computed. Leaf
// is what a person confirmed. Nothing here uses a colour to mean something else.

export const metadata: Metadata = {
  title: "How AapatVani works",
  description: "The pipeline, who does what at each step, and the four origins every claim carries.",
};

const CHAIN = [
  { icon: PenLine, label: "Report", who: "A person", tone: "coral" },
  { icon: ScanText, label: "Read", who: "The model", tone: "violet" },
  { icon: GitCompareArrows, label: "Group", who: "Code, then a person", tone: "moss" },
  { icon: Route, label: "Analyse", who: "Code", tone: "moss" },
  { icon: UserRoundCheck, label: "Decide", who: "A person", tone: "leaf" },
] as const;

const TONE = {
  coral: { tint: "bg-coral-tint", ink: "text-coral-strong", dot: "bg-coral" },
  violet: { tint: "bg-violet-tint", ink: "text-violet-strong", dot: "bg-violet" },
  moss: { tint: "bg-moss-tint", ink: "text-moss-strong", dot: "bg-moss" },
  leaf: { tint: "bg-leaf-tint", ink: "text-leaf-strong", dot: "bg-leaf" },
} as const;

export default function HowItWorksPage() {
  return (
    <div className="min-h-[100svh] bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 sm:px-8 sm:py-12">
        <header className="flex flex-col gap-4">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink-soft hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            AapatVani
          </Link>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            How AapatVani works
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-ink-soft sm:text-lg">
            A community report becomes a decision in five steps. Only one of them asks a model
            anything, and none of them lets a machine decide. This page is the whole system at a
            glance — what each part does, and what it is never allowed to do.
          </p>
        </header>

        {/* ---------------------------------------------------------------- the chain */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            The chain
          </h2>
          <ol className="grid gap-3 sm:grid-cols-5">
            {CHAIN.map((step, index) => {
              const tone = TONE[step.tone];
              const Icon = step.icon;
              return (
                <li key={step.label} className={`flex flex-col gap-2 rounded-3xl p-4 ${tone.tint}`}>
                  <span className="flex items-center gap-2">
                    <span className={`grid size-8 place-items-center rounded-xl bg-card/70 ${tone.ink}`}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className={`text-xs font-semibold tabular-nums ${tone.ink}`}>{index + 1}</span>
                  </span>
                  <span className="text-base font-bold">{step.label}</span>
                  <span className={`text-xs font-medium ${tone.ink}`}>{step.who}</span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ---------------------------------------------------- what each part does */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Who does what
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card
              tone="coral"
              icon={Mic}
              title="What a reporter sends"
              lede="No account, no name, no phone number."
              items={[
                "Text in Nepali or English, typed or spoken",
                "A photograph, if it is safe to take one",
                "A voice note — typing Devanagari on a phone is a real barrier",
                "A location three ways: GPS, a dropped pin, or the name of the place",
              ]}
            />
            <Card
              tone="violet"
              icon={Sparkles}
              title="What the model reads"
              lede="Gemini reads; it does not decide, and it never sees an identifier."
              items={[
                "It cites short aliases — R1, M1, A1 — which the server maps back to real records",
                "Every quotation it gives is checked against the reporter's own words",
                "A quote that cannot be found is relabelled as interpretation, not kept",
                "Coordinates are never accepted from it, only from GPS, a pin or our map data",
              ]}
            />
            <Card
              tone="moss"
              icon={Calculator}
              title="What code computes"
              lede="Deterministic, reproducible, and fast — about 11 milliseconds."
              items={[
                "Which reports describe the same event, by distance, time and wording",
                "Which reports are copies of another, so they stop counting as witnesses",
                "Where reports disagree, by rule as well as by model",
                "Which settlements lose their road to a health facility if a segment is blocked",
              ]}
            />
            <Card
              tone="leaf"
              icon={CircleCheck}
              title="What a person confirms"
              lede="The word Confirmed appears only after a named reviewer acts."
              items={[
                "Every claim is confirmed, corrected, rejected or queried — one at a time",
                "Only a reviewer merges two reports into one incident",
                "Every finding of the road analysis is confirmed or dismissed individually",
                "An alert stays a draft until a reviewer approves it, and is never sent",
              ]}
            />
          </div>
        </section>

        {/* ---------------------------------------------------------------- provenance */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            The four origins, and why colour is never alone
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-ink-soft">
            Every claim, finding and map feature carries where it came from. Each origin has its own
            colour, its own icon and its own word, so nothing depends on being able to tell the
            colours apart.
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            {(
              [
                { tone: "coral", label: "Reported", note: "the reporter's words, quote verified" },
                { tone: "violet", label: "AI interpretation", note: "the model read it from text, photo or audio" },
                { tone: "moss", label: "Computed", note: "deterministic code over our datasets" },
                { tone: "leaf", label: "Reviewer", note: "a person entered or corrected it" },
              ] as const
            ).map((origin) => {
              const tone = TONE[origin.tone];
              return (
                <div key={origin.label} className={`flex flex-col gap-3 rounded-3xl p-4 ${tone.tint}`}>
                  <span className={`size-3 rounded-full ${tone.dot}`} aria-hidden />
                  <span className="text-sm font-bold">{origin.label}</span>
                  <span className="text-xs leading-relaxed text-ink-soft">{origin.note}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------------------------------------------------------------- the road */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            The part a map pin cannot tell you
          </h2>
          <div className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 sm:flex-row sm:items-center">
            <div className="flex flex-col gap-3 sm:flex-1">
              <span className="grid size-10 place-items-center rounded-2xl bg-moss-tint text-moss-strong">
                <MapPinned className="size-5" aria-hidden />
              </span>
              <p className="text-sm leading-relaxed text-ink-soft">
                A radius tells a responder how far away a landslide is. It does not tell them which
                villages have just lost their road to a hospital. AapatVani removes the blocked
                segment from the <b className="text-foreground">real OpenStreetMap network</b> and
                re-runs shortest paths from all 36 health facilities, before and after.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:w-72">
              {[
                { n: "11,340", l: "road junctions" },
                { n: "36", l: "health facilities" },
                { n: "~11 ms", l: "per analysis" },
              ].map((stat) => (
                <div key={stat.l} className="flex flex-col gap-1 rounded-2xl bg-moss-tint p-3">
                  <span className="text-lg font-bold tabular-nums text-moss-strong">{stat.n}</span>
                  <span className="text-[11px] leading-tight text-ink-soft">{stat.l}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- boundaries */}
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            What it never does
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-ink-soft">
            Stated plainly, because the trustworthiness of everything above depends on it.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: TriangleAlert,
                title: "It does not predict",
                note: "No hazard, runout or flood extent. No casualties, damage or where an event will spread. It computes what a blockage means for road access, which is answerable from what communities report.",
              },
              {
                // The positive framing of the same fact: the decision belongs to a person.
                icon: UserRoundCheck,
                title: "It does not decide",
                note: "A similarity score never merges anything. The model never holds a real identifier or a coordinate. Being outside the analysis area is reported as unchecked, never as safe.",
              },
              {
                icon: BellOff,
                title: "It does not broadcast",
                note: "Every alert is a draft a named person approves. The application has no capability to send one at all, and the audit trail records that nothing was sent.",
              },
            ].map((boundary) => {
              const Icon = boundary.icon;
              return (
                <div key={boundary.title} className="flex flex-col gap-3 rounded-3xl bg-sand p-5">
                  <span className="grid size-9 place-items-center rounded-xl bg-card text-ink-soft">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-sm font-bold">{boundary.title}</span>
                  <span className="text-xs leading-relaxed text-ink-soft">{boundary.note}</span>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <Link
            href="/report"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-cream"
          >
            Send a report
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href="/" className="text-sm font-medium text-ink-soft hover:underline">
            Back to the start
          </Link>
          <span className="ml-auto text-xs text-muted-foreground">
            Real OpenStreetMap geography · synthetic demo reports, labelled as such
          </span>
        </footer>
      </div>
    </div>
  );
}

function Card({
  tone,
  icon: Icon,
  title,
  lede,
  items,
}: {
  tone: keyof typeof TONE;
  icon: typeof Mic;
  title: string;
  lede: string;
  items: string[];
}) {
  const t = TONE[tone];
  return (
    <div className={`flex flex-col gap-3 rounded-3xl p-5 ${t.tint}`}>
      <span className={`grid size-10 place-items-center rounded-2xl bg-card/70 ${t.ink}`}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="text-base font-bold">{title}</span>
      <span className="text-xs font-medium text-ink-soft">{lede}</span>
      <ul className="flex flex-col gap-2 pt-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-relaxed text-ink-soft">
            <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${t.dot}`} aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
