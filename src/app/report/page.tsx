import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Megaphone, TriangleAlert } from "lucide-react";
import { LanguageToggle } from "@/components/av/language-toggle";
import { ReportForm, type HazardOption } from "@/components/report/report-form";
import { getRegion } from "@/config/regions";
import { getEnv } from "@/lib/env";
import { translator } from "@/lib/i18n";
import { getLocale } from "@/lib/prefs";

// The public report form.
//
// Someone filling this in may be frightened, may be standing in the rain, and may be typing on a
// cracked phone screen. So: one card, one column of thought, generous targets, and nothing that
// asks them to make a decision they cannot make. The emergency numbers sit above the form rather
// than inside it, because someone who needs them should not have to scroll past a form to find them.

export const metadata: Metadata = { title: "Report an incident" };

export default function ReportPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-10">
      <Suspense fallback={<div className="mx-auto h-96 max-w-3xl animate-pulse rounded-3xl bg-sand" aria-hidden />}>
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

  // The reporter's own names first. "Unclear" is left out: someone who is unsure simply does not
  // pick one, and "Other" covers everything else.
  const hazards: HazardOption[] = region.hazards
    .filter((hazard) => hazard.id !== "unclear")
    .map((hazard) => ({ id: hazard.id, label: hazard.label, labelLocal: hazard.labelLocal, icon: hazard.icon }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          {t("common.back")}
        </Link>
        <LanguageToggle locale={locale} />
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-flame-tint px-5 py-3.5 text-sm text-flame-strong">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        <span>{t("landing.emergency")}</span>
        <span className="font-semibold">
          {region.emergencyNumbers
            .map((line) => `${locale === "ne" ? line.labelLocal : line.label} ${line.number}`)
            .join(" · ")}
        </span>
      </p>

      <div className="overflow-hidden rounded-3xl bg-card">
        <header className="flex items-start gap-4 border-b border-border px-6 py-5 sm:px-8">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-leaf-tint text-leaf-strong">
            <Megaphone className="size-5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-xl font-bold tracking-tight">{t("form.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("app.noPersonalData")}</p>
          </div>
        </header>

        <div className="px-6 py-6 sm:px-8 sm:py-7">
          <ReportForm
            locale={locale}
            hazards={hazards}
            center={region.map.center}
            zoom={region.map.zoom}
            tileUrl={env.map.tileUrl}
            attribution={env.map.attribution}
          />
        </div>
      </div>
    </div>
  );
}
