"use client";

// The receipt (feature M1's "what we understood"). Two things happen here, in this order:
//
//   1. the report is shown back immediately, with its reference code, so the reporter knows it
//      arrived even if the model is slow or unavailable;
//   2. extraction is triggered once, then the page shows what was read.
//
// Extraction is started here rather than during submission so that a 30-second model call never
// stands between a reporter and the confirmation that their report was saved.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, CircleCheck, Info, LoaderCircle, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";

type ReceiptStatus = "received" | "extracting" | "extracted" | "extraction_failed" | "ai_unavailable";

interface ReceiptClaim {
  id: string;
  statement: string;
  statementEn: string;
  origin: "reporter" | "ai" | "computed" | "reviewer";
  verified: boolean;
}

interface ReceiptData {
  report: {
    referenceCode: string;
    text: string;
    uiLanguage: Locale;
    submittedAt: string;
    status: ReceiptStatus;
    statusDetail?: string;
    media: Array<{ id: string; kind: "photo" | "audio" }>;
  };
  claims: ReceiptClaim[];
  transcript?: string;
  missingInformation: string[];
  aiAvailable: boolean;
}

/**
 * How each origin is labelled. Colour never stands alone here: the badge carries the words, and the
 * sentence beneath it is the reporter's or the model's own text.
 */
const ORIGIN_STYLE = {
  reporter: { className: "bg-coral-tint text-coral-strong", key: "reporter" },
  ai: { className: "bg-violet-tint text-violet-strong", key: "ai" },
  computed: { className: "bg-moss-tint text-moss-strong", key: "computed" },
  reviewer: { className: "bg-leaf-tint text-leaf-strong", key: "reviewer" },
} as const;

export function Receipt({ reportId, locale }: { reportId: string; locale: Locale }) {
  const t = translator(locale);
  const [data, setData] = useState<ReceiptData | null>(null);
  const [state, setState] = useState<"loading" | "reading" | "ready" | "denied">("loading");
  const started = useRef(false);

  const load = useCallback(
    async (token: string): Promise<ReceiptData | null> => {
      const response = await fetch(`/api/reports/${reportId}/receipt`, { headers: { "x-submit-token": token } });
      if (response.status === 403) {
        setState("denied");
        return null;
      }
      if (!response.ok) return null;
      return (await response.json()) as ReceiptData;
    },
    [reportId],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      // Deferred into the async body so the first render is not followed by a synchronous state
      // update: reading storage is only possible in the browser anyway.
      const token = (() => {
        try {
          return sessionStorage.getItem(`av:submit:${reportId}`);
        } catch {
          return null;
        }
      })();

      if (!token) {
        setState("denied");
        return;
      }

      const first = await load(token);
      if (!first) return;
      setData(first);

      // Extraction has already run for this report (or already failed): there is nothing to trigger.
      if (first.report.status !== "received") {
        setState("ready");
        return;
      }

      setState("reading");
      await fetch(`/api/reports/${reportId}/extract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submitToken: token }),
      }).catch(() => undefined);

      const after = await load(token);
      if (after) setData(after);
      setState("ready");
    })();
  }, [load, reportId]);

  if (state === "denied") {
    return (
      <p className="flex items-start gap-2 rounded-2xl bg-amber-tint px-4 py-3 text-sm text-amber-strong">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{t("receipt.notFound")}</span>
      </p>
    );
  }

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        {t("receipt.loading")}
      </p>
    );
  }

  const { report, claims, missingInformation } = data;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-3xl bg-primary px-5 py-6 text-primary-foreground">
        <p className="flex items-center gap-2 text-sm font-medium text-primary-foreground/80">
          <CircleCheck className="size-4" aria-hidden />
          {t("receipt.title")}
        </p>
        <div className="rounded-2xl bg-primary-foreground/10 px-4 py-3">
          <p className="text-xs text-primary-foreground/70">{t("receipt.reference")}</p>
          <p className="font-mono text-2xl font-semibold tracking-wide">{report.referenceCode}</p>
        </div>
        <p className="text-sm text-primary-foreground/80" aria-live="polite">
          {state === "reading" ? t("receipt.status.extracting") : t(`receipt.status.${report.status}`)}
        </p>
        <p className="text-xs text-primary-foreground/60">{t("receipt.referenceHint")}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("receipt.understoodTitle")}</h2>
        {claims.length === 0 ? (
          <p className="rounded-2xl bg-sand px-4 py-3 text-sm text-muted-foreground">{t("receipt.understoodEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {claims.map((claim) => {
              const origin = ORIGIN_STYLE[claim.origin] ?? ORIGIN_STYLE.ai;
              const statement = locale === "ne" && claim.statement ? claim.statement : claim.statementEn;
              return (
                <li key={claim.id} className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-3.5">
                  <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${origin.className}`}>
                    {t(`receipt.origin.${origin.key}`)}
                  </span>
                  <p className="text-sm" lang={locale === "ne" && claim.statement ? "ne" : "en"}>
                    {statement}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {data.transcript ? (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Mic className="size-5 text-ink-soft" aria-hidden />
            {t("form.voice")}
          </h2>
          <p className="rounded-2xl bg-violet-tint px-4 py-3 text-sm text-violet-strong">{data.transcript}</p>
        </section>
      ) : null}

      {missingInformation.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("receipt.missingTitle")}</h2>
          <ul className="flex flex-col gap-1.5">
            {missingInformation.slice(0, 6).map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2 rounded-2xl bg-leaf-tint px-4 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-leaf-strong">
          <Check className="size-4" aria-hidden />
          {t("receipt.nextTitle")}
        </h2>
        <p className="text-sm text-leaf-strong/90">{t("receipt.nextBody")}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("receipt.originalTitle")}</h2>
        <blockquote
          lang={report.uiLanguage}
          className="whitespace-pre-wrap rounded-2xl border border-border bg-card px-4 py-3.5 text-sm"
        >
          {report.text || <span className="text-muted-foreground">—</span>}
        </blockquote>
        {report.media.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {report.media.map((item) => (item.kind === "photo" ? t("form.photo") : t("form.voice"))).join(" · ")}
          </p>
        ) : null}
      </section>

      <div className="flex flex-col gap-2 pb-4 sm:flex-row">
        <Button asChild variant="outline" className="h-12 rounded-full">
          <Link href="/report">{t("receipt.another")}</Link>
        </Button>
        <Button asChild variant="ghost" className="h-12 rounded-full">
          <Link href="/">{t("common.close")}</Link>
        </Button>
      </div>
    </div>
  );
}
