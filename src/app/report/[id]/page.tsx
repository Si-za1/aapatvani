import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/av/logo";
import { Receipt } from "@/components/report/receipt";
import { translator } from "@/lib/i18n";
import { getLocale } from "@/lib/prefs";

// The receipt for one report. Reached only by the browser that sent it: the submit token it keeps
// in sessionStorage is what the server checks, so the page reveals nothing on its own.

export const metadata: Metadata = { title: "Your report" };

export default function ReceiptPage({ params }: PageProps<"/report/[id]">) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-sand" aria-hidden />}>
        <Screen params={params} />
      </Suspense>
    </main>
  );
}

async function Screen({ params }: { params: PageProps<"/report/[id]">["params"] }) {
  const [{ id }, locale] = await Promise.all([params, getLocale()]);
  const t = translator(locale);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <Logo className="size-7" />
          <span className="text-base font-bold tracking-tight" lang={locale}>
            {locale === "ne" ? "आपतवाणी" : "AapatVani"}
          </span>
        </Link>
        <Link href="/report" className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          {t("common.back")}
        </Link>
      </div>
      <Receipt reportId={id} locale={locale} />
    </>
  );
}
