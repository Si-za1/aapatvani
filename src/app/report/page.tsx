import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Phone } from "lucide-react";
import { LanguageToggle } from "@/components/av/language-toggle";
import { ReportForm, type HazardOption } from "@/components/report/report-form";
import { getRegion } from "@/config/regions";
import { getEnv } from "@/lib/env";
import { LOCALES, translator } from "@/lib/i18n";
import { getLocale } from "@/lib/prefs";

// The public report form. Deliberately plain and short: it is used one-handed, outdoors, sometimes
// in a hurry, so the page carries no reviewer chrome and no navigation beyond "back".

export const metadata: Metadata = { title: "Report an incident" };

export default function ReportPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-sand" aria-hidden />}>
        <Screen />
      </Suspense>
    </main>
  );
}

async function Screen() {
  const locale = await getLocale();
  const t = translator(locale);
  const env = getEnv();
  const region = getRegion(env.defaultRegionId);

  // The reporter's own local names come first, with the English term beside them. "Unclear" is left
  // out: a person who is unsure simply does not pick one, and "Other" covers everything else.
  const hazards: HazardOption[] = region.hazards
    .filter((hazard) => hazard.id !== "unclear")
    .map((hazard) => ({ id: hazard.id, label: hazard.label, labelLocal: hazard.labelLocal, icon: hazard.icon }));

  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          {t("common.back")}
        </Link>
        <LanguageToggle locale={locale} />
      </header>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold sm:text-3xl">{t("form.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("app.noPersonalData")}</p>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-flame-tint px-4 py-3 text-sm text-flame-strong">
        <Phone className="size-4 shrink-0" aria-hidden />
        <span>{t("landing.emergency")}</span>
        <span className="font-medium">
          {region.emergencyNumbers.map((line) => `${line.labelLocal} ${line.number}`).join(" · ")}
        </span>
      </p>

      <ReportForm
        locale={locale}
        hazards={hazards}
        center={region.map.center}
        zoom={region.map.zoom}
        tileUrl={env.map.tileUrl}
        attribution={env.map.attribution}
      />

      <p className="pb-4 text-center text-xs text-muted-foreground">
        {LOCALES.map((l) => l.native).join(" · ")}
      </p>
    </>
  );
}
