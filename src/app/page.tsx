import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { HazardGlyph } from "@/components/av/hazard-icon";
import { Logo } from "@/components/av/logo";
import { LanguageToggle } from "@/components/av/language-toggle";
import { getRegion } from "@/config/regions";
import { getEnv } from "@/lib/env";
import { translator } from "@/lib/i18n";
import { getLocale } from "@/lib/prefs";

// The public landing page. The first thing a reporter sees, often on a phone on a weak connection,
// so it is static apart from the language cookie and carries no data reads.
//
// The shape is deliberate: everything a reporter needs on the left (what this is, one button, what
// can be reported, what we will not do), and the explanation of how it works on the right as cards,
// because nobody reads three steps before deciding to report, they read them afterwards, if at all.

export default function Home() {
  return (
    // One screen, no scrolling, at every size a browser is likely to be opened at. The page scales
    // rather than scrolls: the type, the gaps and the card padding are all tied to the viewport
    // height below, so a short laptop window gets the same page, smaller, instead of the same page
    // with the last third cut off. A window shorter than about 600px still scrolls, because the
    // alternative there is unreadable text.
    <div className="flex min-h-[100svh] flex-col bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-4 sm:px-8 sm:py-6">
        <Suspense fallback={<div className="flex-1 animate-pulse rounded-3xl bg-sand" aria-hidden />}>
          <Landing />
        </Suspense>
      </div>
    </div>
  );
}

async function Landing() {
  const locale = await getLocale();
  const t = translator(locale);
  const env = getEnv();
  const region = getRegion(env.defaultRegionId);
  const hazards = region.hazards.filter((h) => !["unclear", "other"].includes(h.id));

  const steps = [
    { n: 1, title: t("landing.step1.title"), body: t("landing.step1.body"), tone: "bg-coral-tint text-coral-strong" },
    { n: 2, title: t("landing.step2.title"), body: t("landing.step2.body"), tone: "bg-violet-tint text-violet-strong" },
    { n: 3, title: t("landing.step3.title"), body: t("landing.step3.body"), tone: "bg-leaf-tint text-leaf-strong" },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-[2rem] bg-card [--pad:clamp(1.125rem,2.6vh,2.5rem)] [--gap:clamp(0.85rem,2.2vh,1.75rem)]">
      <header className="flex items-center justify-between gap-4 px-6 py-[clamp(0.55rem,1.6vh,1.25rem)] sm:px-[var(--pad)]">
        <span className="inline-flex items-center gap-2.5">
          <Logo className="size-7" />
          <span className="text-[clamp(1rem,1.9vh,1.125rem)] font-bold tracking-tight" lang={locale}>
            {locale === "ne" ? "आपतवाणी" : "AapatVani"}
          </span>
        </span>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent sm:inline-flex"
          >
            <Users className="size-4" aria-hidden />
            {t("landing.responder")}
          </Link>
          <LanguageToggle locale={locale} />
        </div>
      </header>

      <section className="grid flex-1 gap-x-[clamp(1.5rem,3vw,3rem)] gap-y-[var(--gap)] px-6 pb-[clamp(0.4rem,1.8vh,2.5rem)] sm:px-[var(--pad)] md:grid-cols-[1.05fr_1fr] md:items-center">
        {/* Left: what this is, and the one thing to do. */}
        <div className="flex flex-col gap-[var(--gap)]">
          <h1
            className="max-w-xl text-[clamp(1.45rem,3.3vh,2.75rem)] leading-[1.08] font-bold tracking-[-0.02em]"
            lang={locale}
          >
            {t("app.tagline")}
          </h1>

          <div className="flex flex-col gap-[clamp(0.6rem,1.4vh,1rem)]">
            <p className="max-w-md text-[clamp(0.85rem,1.7vh,0.95rem)] leading-relaxed text-muted-foreground" lang={locale}>
              {t("app.intro")}
            </p>

            <Link
              href="/report"
              className="group inline-flex w-fit items-center gap-3 rounded-full bg-primary py-2 pr-2 pl-6 text-base font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
            >
              <span lang={locale}>{t("landing.cta")}</span>
              <span className="grid size-9 place-items-center rounded-full bg-leaf text-leaf-strong transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </Link>
          </div>

          {/* Below the button: what can actually be reported. Each icon sits in its own soft badge
              rather than floating next to the word, which is what makes the row read as a set. */}
          <div className="flex flex-col gap-[clamp(0.5rem,1.2vh,1rem)]">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase" lang={locale}>
              {t("landing.hazardsTitle")}
            </h2>
            <ul className="flex flex-wrap gap-[clamp(0.35rem,0.8vh,0.5rem)]">
              {hazards.map((hazard) => (
                <li
                  key={hazard.id}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card py-[clamp(0.2rem,0.5vh,0.375rem)] pr-4 pl-1.5 text-xs font-semibold"
                  title={locale === "ne" ? hazard.labelLocal : hazard.label}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-sand">
                    <HazardGlyph icon={hazard.icon} className="size-4 text-ink-soft" />
                  </span>
                  <span lang={locale}>{locale === "ne" ? hazard.labelLocal : hazard.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* What we will not do, stated plainly, no panel, because a box would make it look like a
              feature rather than a boundary. */}
          <p className="flex items-start gap-2.5 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-flame" aria-hidden />
            <span lang={locale}>{t("landing.trustDont")}</span>
          </p>

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-leaf-strong" aria-hidden />
            <span lang={locale}>{t("app.noPersonalData")}</span>
          </p>
        </div>

        {/* Right: how it works, as cards. Two staggered columns so the eye moves down the flow. */}
        <div className="grid gap-[clamp(0.6rem,1.4vh,1rem)] sm:grid-cols-2">
          <div className="flex flex-col gap-[clamp(0.6rem,1.4vh,1rem)]">
            <StepCard {...steps[0]} />
            <StepCard {...steps[2]} />
          </div>
          <div className="flex flex-col gap-[clamp(0.6rem,1.4vh,1rem)] sm:mt-[clamp(0.5rem,2.5vh,2.5rem)]">
            <StepCard {...steps[1]} />
            <div className="flex flex-col gap-[clamp(0.5rem,1.2vh,1rem)] rounded-3xl bg-primary p-[clamp(0.9rem,2.2vh,1.5rem)] text-primary-foreground">
              {/* A badge, but not a number: this is not a fourth step, and numbering it would say it
                  was. It carries a shield so the card sits in the same rhythm as the three above. */}
              <span className="grid size-7 place-items-center rounded-full bg-white/20">
                <ShieldCheck className="size-4" aria-hidden />
              </span>
              <p className="text-[clamp(0.82rem,1.6vh,0.95rem)] leading-relaxed font-semibold" lang={locale}>
                {t("landing.trustDo")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The emergency line, without a panel behind it: the flame icon and colour carry the weight,
          and a red block on a calm page is its own kind of alarm. The numbers are here, not just on
          the report form, because this is the line someone reads when they are frightened. */}
      <p
        className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-6 py-[clamp(0.35rem,1vh,0.9rem)] text-[clamp(0.75rem,1.45vh,0.875rem)] text-flame-strong sm:px-[var(--pad)]"
        lang={locale}
      >
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        <span>{t("landing.emergency")}</span>
        <span className="font-semibold">
          {region.emergencyNumbers
            .map((line) => `${locale === "ne" ? line.labelLocal : line.label} ${line.number}`)
            .join(" · ")}
        </span>
      </p>

      {/* A wide gap rather than a tight line: the footer is a different kind of information from the
          page above it, and the space is what says so. */}
      <footer className="flex flex-col gap-3 px-6 pb-[clamp(0.4rem,1.2vh,1.5rem)] sm:px-[var(--pad)]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          {/* No build or render time is read here on purpose: anything that changes between
              renders is reported by Next.js as an unstable value during prerendering. */}
          <span>© AapatVani AI</span>
          <a href="https://www.openstreetmap.org/copyright" className="underline" rel="noreferrer" target="_blank">
            Map data © OpenStreetMap contributors
          </a>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-flame" aria-hidden />
            {/* The label every record carries, said once more where it cannot be missed. */}
            Demo data is synthetic
          </span>
        </div>
      </footer>
    </div>
  );
}

function StepCard({ n, title, body, tone }: { n: number; title: string; body: string; tone: string }) {
  // Sized to its content rather than stretched: a card with empty space at the bottom reads as a
  // mistake, and the steps are deliberately different lengths.
  return (
    <div className={`flex flex-col gap-[clamp(0.4rem,1vh,0.75rem)] rounded-3xl p-[clamp(0.9rem,2.2vh,1.5rem)] ${tone}`}>
      <span className="grid size-7 place-items-center rounded-full bg-white/55 text-xs font-bold">{n}</span>
      <h3 className="text-[clamp(0.85rem,1.7vh,1rem)] leading-snug font-semibold">{title}</h3>
      <p className="text-[clamp(0.75rem,1.5vh,0.8125rem)] leading-relaxed opacity-80 [@media(max-height:600px)]:hidden">
        {body}
      </p>
    </div>
  );
}
