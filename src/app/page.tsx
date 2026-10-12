import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Mic, Route, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { HazardGlyph } from "@/components/av/hazard-icon";
import { LanguageToggle } from "@/components/av/language-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getRegion } from "@/config/regions";
import { getEnv } from "@/lib/env";
import { translator } from "@/lib/i18n";
import { getLocale } from "@/lib/prefs";

// The public landing page. It is the first thing a reporter sees on a phone, often on a slow
// connection, so it is static apart from the language cookie and carries no data reads.

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <Suspense fallback={<LandingSkeleton />}>
        <Landing />
      </Suspense>
    </main>
  );
}

async function Landing() {
  const locale = await getLocale();
  const t = translator(locale);
  const region = getRegion(getEnv().defaultRegionId);
  // A handful of hazards, so the page shows what can be reported without becoming a list.
  const sampleHazards = region.hazards.filter((h) => !["other", "unclear"].includes(h.id)).slice(0, 6);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">AapatVani</span>
          <span lang="ne" className="text-sm text-muted-foreground">
            आपतवाणी
          </span>
        </div>
        <LanguageToggle locale={locale} />
      </header>

      <section className="rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-14">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-3 py-1 text-xs font-medium">
          <span className="size-1.5 rounded-full bg-sage" aria-hidden />
          {region.name}
        </p>
        <h1 className="max-w-xl text-3xl font-semibold sm:text-4xl" lang={locale}>
          {t("app.tagline")}
        </h1>
        <p className="mt-4 max-w-xl text-primary-foreground/80" lang={locale}>
          {t("app.intro")}
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="h-12 rounded-full bg-cream px-6 text-base text-ink hover:bg-cream/90">
            <Link href="/report">
              {t("landing.cta")}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <p className="text-sm text-primary-foreground/70" lang={locale}>
            {t("app.noPersonalData")}
          </p>
        </div>
      </section>

      <section aria-labelledby="hazards-heading" className="flex flex-col gap-3">
        <h2 id="hazards-heading" className="text-sm font-medium text-muted-foreground">
          {t("landing.hazardsTitle")}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {sampleHazards.map((hazard) => (
            <li
              key={hazard.id}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm"
            >
              <HazardGlyph icon={hazard.icon} className="size-4 text-ink-soft" />
              <span lang="ne">{hazard.labelLocal}</span>
              <span className="text-muted-foreground">{hazard.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-4">
        <h2 id="how-heading" className="text-xl font-semibold">
          {t("landing.howTitle")}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          <Step
            icon={<Mic className="size-5" />}
            step={1}
            title={t("landing.step1.title")}
            body={t("landing.step1.body")}
            tone="bg-rose-tint text-rose-strong"
          />
          <Step
            icon={<Route className="size-5" />}
            step={2}
            title={t("landing.step2.title")}
            body={t("landing.step2.body")}
            tone="bg-river-tint text-river-strong"
          />
          <Step
            icon={<CircleCheck className="size-5" />}
            step={3}
            title={t("landing.step3.title")}
            body={t("landing.step3.body")}
            tone="bg-sage-tint text-sage-strong"
          />
        </ol>
      </section>

      <Card className="gap-4 border-none bg-sand p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="size-5 text-ink-soft" aria-hidden />
          {t("landing.trustTitle")}
        </h2>
        <p className="text-sm text-foreground/80">{t("landing.trustDo")}</p>
        <p className="flex gap-2 text-sm text-foreground/80">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-clay-strong" aria-hidden />
          <span>{t("landing.trustDont")}</span>
        </p>
      </Card>

      <section className="rounded-2xl border border-clay/50 bg-clay-tint px-5 py-4">
        <p className="flex gap-2 text-sm text-clay-strong">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span lang={locale}>{t("landing.emergency")}</span>
        </p>
      </section>

      <footer className="mt-auto flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:underline">
            <Users className="size-4" aria-hidden />
            {t("landing.responder")}
          </Link>
          <p className="text-xs text-muted-foreground">{t("landing.responderHint")}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Map data ©{" "}
          <a href="https://www.openstreetmap.org/copyright" className="underline" rel="noreferrer" target="_blank">
            OpenStreetMap
          </a>{" "}
          contributors · demo data is synthetic
        </p>
      </footer>
    </div>
  );
}

function Step({
  icon,
  step,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode;
  step: number;
  title: string;
  body: string;
  tone: string;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
      <span className={`inline-flex size-9 items-center justify-center rounded-full ${tone}`} aria-hidden>
        {icon}
      </span>
      <h3 className="text-sm font-semibold">
        <span className="text-muted-foreground">{step}. </span>
        {title}
      </h3>
      <p className="text-sm text-muted-foreground">{body}</p>
    </li>
  );
}

function LandingSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-10" aria-hidden>
      <div className="h-6 w-40 rounded-full bg-sand" />
      <div className="h-64 rounded-3xl bg-sand" />
      <div className="h-32 rounded-2xl bg-sand" />
    </div>
  );
}
