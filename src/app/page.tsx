import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { HazardGlyph } from "@/components/av/hazard-icon";
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
// because nobody reads three steps before deciding to report — they read them afterwards, if at all.

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        <Suspense fallback={<div className="h-[36rem] animate-pulse rounded-3xl bg-sand" aria-hidden />}>
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
    <div className="overflow-hidden rounded-[2rem] bg-card">
      <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <span className="text-lg font-bold tracking-tight" lang={locale}>
          {locale === "ne" ? "आपतवाणी" : "AapatVani"}
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

      <section className="grid gap-10 px-6 pt-6 pb-10 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pt-10">
        {/* Left: what this is, and the one thing to do. */}
        <div className="flex flex-col gap-7">
          <h1 className="max-w-xl text-[2.5rem] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[3.25rem]" lang={locale}>
            {t("app.tagline")}
          </h1>

          <div className="flex flex-col gap-5">
            <p className="max-w-lg text-[15px] leading-relaxed text-muted-foreground" lang={locale}>
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
          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase" lang={locale}>
              {t("landing.hazardsTitle")}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {hazards.map((hazard) => (
                <li
                  key={hazard.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-3.5 pl-1.5 text-xs font-medium"
                  title={locale === "ne" ? hazard.labelLocal : hazard.label}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sand">
                    <HazardGlyph icon={hazard.icon} className="size-3.5 text-ink-soft" />
                  </span>
                  <span lang={locale}>{locale === "ne" ? hazard.labelLocal : hazard.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* What we will not do, stated plainly — no panel, because a box would make it look like a
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
        <div className="grid gap-4 sm:grid-cols-2 lg:pt-2">
          <div className="flex flex-col gap-4">
            <StepCard {...steps[0]} />
            <StepCard {...steps[2]} />
          </div>
          <div className="flex flex-col gap-4 sm:mt-12">
            <StepCard {...steps[1]} />
            <div className="flex flex-col justify-between gap-8 rounded-3xl bg-primary p-6 text-primary-foreground">
              <p className="text-[15px] font-semibold leading-relaxed" lang={locale}>
                {t("landing.trustDo")}
              </p>
              <p className="text-xs text-primary-foreground/60" lang={locale}>
                {region.name} · OpenStreetMap
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The emergency line, without a panel behind it: the flame icon and colour carry the weight,
          and a red block on a calm page is its own kind of alarm. */}
      <p className="flex gap-2.5 px-6 text-sm text-flame-strong sm:px-10" lang={locale}>
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{t("landing.emergency")}</span>
      </p>

      <footer className="flex flex-col gap-4 border-t border-border px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <Link
          href="/login"
          className="inline-flex w-fit items-center gap-2 rounded-full bg-sand px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <Users className="size-4" aria-hidden />
          {t("landing.responder")}
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
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
    <div className={`flex flex-col gap-3 rounded-3xl p-6 ${tone}`}>
      <span className="grid size-7 place-items-center rounded-full bg-white/55 text-xs font-bold">{n}</span>
      <h3 className="text-base font-semibold leading-snug">{title}</h3>
      <p className="text-[13px] leading-relaxed opacity-80">{body}</p>
    </div>
  );
}
