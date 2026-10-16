import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleCheck, MapPinned, Mic, ScanText } from "lucide-react";
import { getLocale } from "@/lib/prefs";
import { translator } from "@/lib/i18n";

// How the system works, for anyone evaluating it rather than using it.
//
// ONE SCREEN, FOUR CARDS. Everything that was here before — the origins table, the boundaries, the
// measurement panel — was true and belonged somewhere else. A page called "how it works" has one
// job, and a reader should be able to hold the whole answer without scrolling.
//
// Bilingual, like every other screen a member of the public can reach: the language toggle is
// global, and a reader who has chosen Nepali should not land on English by clicking a link in the
// footer. The hackathon's English requirement is about submission material, not about a product
// whose users are Nepali.
//
// Colour is the trust palette, in the order the work happens: coral is what a person reported, violet
// is what the model read, moss is what code computed, leaf is what a person confirmed. Reading the
// four cards left to right teaches the colour system by using it.

export const metadata: Metadata = {
  title: "How AapatVani works",
  description: "Four steps: a report arrives, the model reads it, code checks and computes, a person decides.",
};

const TONES = [
  { tone: "bg-coral-tint", ink: "text-coral-strong", icon: Mic, title: "how.step1.title", body: "how.step1.body" },
  { tone: "bg-violet-tint", ink: "text-violet-strong", icon: ScanText, title: "how.step2.title", body: "how.step2.body" },
  { tone: "bg-moss-tint", ink: "text-moss-strong", icon: MapPinned, title: "how.step3.title", body: "how.step3.body" },
  { tone: "bg-leaf-tint", ink: "text-leaf-strong", icon: CircleCheck, title: "how.step4.title", body: "how.step4.body" },
] as const;

/**
 * The page has to read a cookie to know which language to render, and a cookie is request-time data
 * — reading it during prerendering fails the build outright ("Next.js encountered uncached or
 * runtime data during prerendering"). So the outer component stays synchronous and the reading
 * happens inside a Suspense boundary, which is the pattern every public page here uses.
 */
export default function HowItWorksPage() {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background">
      <Suspense fallback={<div className="flex-1" aria-hidden />}>
        <Screen />
      </Suspense>
    </div>
  );
}

async function Screen() {
  const locale = await getLocale();
  const t = translator(locale);
  const brand = locale === "ne" ? "आपतवाणी" : "AapatVani";
  // The brand is the one word inside the heading that carries a colour, so the title is split
  // around its placeholder rather than rendered from one string.
  const [titleBefore = "", titleAfter = ""] = t("how.title").split("{brand}");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-6 sm:px-8 sm:py-8">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t("how.back")}
          </Link>
        </header>

        {/* The whole answer, one screen, centred. */}
        <main className="flex flex-1 flex-col justify-center gap-[clamp(1.75rem,5vh,3.5rem)] py-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <h1
              className="text-[clamp(1.9rem,5.2vh,3rem)] leading-[1.15] font-bold tracking-[-0.03em] text-balance"
              lang={locale}
            >
              {titleBefore}
              <span className="text-moss-strong">{brand}</span>
              {titleAfter}
            </h1>
            <p
              className="max-w-lg text-[clamp(0.9rem,1.9vh,1.05rem)] leading-relaxed text-muted-foreground"
              lang={locale}
            >
              {t("how.lede")}
            </p>
          </div>

          <ol className="grid gap-[clamp(1rem,2.4vw,1.75rem)] sm:grid-cols-2 lg:grid-cols-4">
            {TONES.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex flex-col gap-4" lang={locale}>
                  <div className={`grid aspect-square w-full place-items-center rounded-[2rem] ${step.tone}`}>
                    <Icon className={`size-[clamp(2.25rem,6vh,3.25rem)] ${step.ink}`} aria-hidden />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className={`text-xs font-semibold tabular-nums ${step.ink}`}>
                      {t("how.stepLabel", { n: index + 1 })}
                    </span>
                    <h2 className="text-[clamp(1rem,2.1vh,1.15rem)] font-bold tracking-tight">{t(step.title)}</h2>
                    <p className="text-[clamp(0.8rem,1.7vh,0.9rem)] leading-relaxed text-muted-foreground">
                      {t(step.body)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/report"
              className="group inline-flex items-center gap-3 rounded-full bg-primary py-2 pr-2 pl-6 text-base font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
            >
              <span lang={locale}>{t("how.sendReport")}</span>
              <span className="grid size-9 place-items-center rounded-full bg-leaf text-leaf-strong transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </Link>
            <Link
              href="/"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
              lang={locale}
            >
              {t("how.back")}
            </Link>
          </div>
        </main>
    </div>
  );
}
