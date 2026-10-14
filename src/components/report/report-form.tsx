"use client";

// The public report form (feature M1). Design decisions worth knowing:
//
//   • Nothing is required except something to say. A reporter in a hurry can send three words.
//   • No personal data is asked for anywhere, there is no name, phone or email field at all.
//   • The one call to action is "Send report"; everything else is optional and labelled as such.
//   • On success the browser is sent straight to the receipt. Extraction runs afterwards, from the
//     receipt page, so a slow model call never holds up the person who is standing in the rain.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HazardGlyph } from "@/components/av/hazard-icon";
import { translator, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LocationField, EMPTY_LOCATION, type LocationValue } from "./location-field";
import { PhotoField, type PreparedPhoto } from "./photo-field";
import { VoiceRecorder, type VoiceNote } from "./voice-recorder";

export interface HazardOption {
  id: string;
  label: string;
  labelLocal: string;
  icon: Parameters<typeof HazardGlyph>[0]["icon"];
}

const TIME_HINTS = ["now", "earlier_today", "yesterday", "unsure"] as const;
type TimeHintValue = (typeof TIME_HINTS)[number];

/** Mirrors MAX_MEDIA_ITEMS and the per-file limit in lib/reports/service.ts. */
const MAX_FILES = 4;
const MAX_MB = 8;

export const SUBMIT_TOKEN_PREFIX = "av:submit:";

/**
 * A location mode with nothing in it is not a location. If someone taps "drop a pin" or "type a
 * place name" and then does not, the report is sent with no location rather than a source that
 * claims one, otherwise the server rejects the whole submission over a field the reporter never
 * meant to fill.
 */
function settledLocation(location: LocationValue): LocationValue {
  if (location.source === "place_name" && !location.placeText.trim()) return EMPTY_LOCATION;
  if ((location.source === "gps" || location.source === "pin") && !location.point) return EMPTY_LOCATION;
  return location;
}

export function ReportForm({
  locale,
  hazards,
  center,
  zoom,
  tileUrl,
  attribution,
}: {
  locale: Locale;
  hazards: HazardOption[];
  center: [number, number];
  zoom: number;
  tileUrl: string;
  attribution: string;
}) {
  const t = translator(locale);
  const router = useRouter();

  const [text, setText] = useState("");
  const [hazard, setHazard] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);
  const [timeHint, setTimeHint] = useState<TimeHintValue | null>(null);
  const [timeText, setTimeText] = useState("");
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSomething = text.trim().length > 0 || Boolean(photo) || Boolean(voice);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!hasSomething) {
      setError(t("form.required"));
      return;
    }
    if (Number(Boolean(photo)) + Number(Boolean(voice)) > MAX_FILES) {
      setError(t("form.tooManyFiles", { n: MAX_FILES }));
      return;
    }

    const form = new FormData();
    const place = settledLocation(location);
    form.set("text", text.trim());
    form.set("uiLanguage", locale);
    if (hazard) form.set("reporterHazard", hazard);
    form.set("locationSource", place.source);
    if ((place.source === "gps" || place.source === "pin") && place.point) {
      form.set("lat", String(place.point.lat));
      form.set("lng", String(place.point.lng));
      if (place.accuracyM !== null) form.set("accuracyM", String(place.accuracyM));
    }
    if (place.source === "place_name" && place.placeText.trim()) {
      form.set("placeText", place.placeText.trim());
    }
    if (timeHint) form.set("timeHint", timeHint);
    if (timeText.trim()) form.set("reportedTimeText", timeText.trim());
    // Only ever one transform, because only the photo path can change a file.
    if (photo?.transform) form.set("clientTransform", photo.transform);
    if (photo) form.append("media", photo.file);
    if (voice) form.append("media", voice.file);

    setSubmitting(true);
    try {
      const response = await fetch("/api/reports", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { id?: string; submitToken?: string; error?: string };

      if (!response.ok || !body.id || !body.submitToken) {
        setError(body.error ?? t("form.errorGeneric"));
        setSubmitting(false);
        return;
      }

      // The token proves this browser sent the report, so only it can ask for extraction or read
      // the receipt. It lives in sessionStorage: gone when the tab closes, never in a URL.
      try {
        sessionStorage.setItem(`${SUBMIT_TOKEN_PREFIX}${body.id}`, body.submitToken);
      } catch {
        // Private browsing can block storage. The report is already saved; the receipt will explain.
      }
      router.push(`/report/${body.id}`);
    } catch {
      setError(navigator.onLine ? t("form.errorGeneric") : t("form.errorOffline"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" lang={locale} noValidate>
      <Field label={t("form.whatHappened")} hint={t("form.whatHappenedHint")}>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("form.whatHappenedPlaceholder")}
          rows={5}
          maxLength={4000}
          className="min-h-36 rounded-2xl border-border bg-background p-4 text-base leading-relaxed"
        />
      </Field>

      <Field label={t("form.hazard")} hint={t("form.hazardHint")} optional={t("form.optional")}>
        <div className="flex flex-wrap gap-2">
          {hazards.map((option) => {
            const active = hazard === option.id;
            // One language at a time: the reporter picked the language they read, and the other
            // script next to every option is noise on a phone.
            const label = locale === "ne" ? option.labelLocal : option.label;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setHazard(active ? null : option.id)}
                className={cn(
                  "inline-flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors",
                  active
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-accent",
                )}
              >
                <HazardGlyph icon={option.icon} className="size-4.5" />
                <span lang={locale}>{label}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={t("form.where")} hint={t("form.whereHint")}>
        <LocationField
          locale={locale}
          value={location}
          onChange={setLocation}
          center={center}
          zoom={zoom}
          tileUrl={tileUrl}
          attribution={attribution}
        />
      </Field>

      <Field label={t("form.when")} optional={t("form.optional")}>
        <div className="flex flex-wrap gap-2">
          {TIME_HINTS.map((hint) => (
            <button
              key={hint}
              type="button"
              aria-pressed={timeHint === hint}
              onClick={() => setTimeHint(timeHint === hint ? null : hint)}
              className={cn(
                "rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-colors",
                timeHint === hint
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              {t(`form.when.${hint}` as const)}
            </button>
          ))}
        </div>
        <Input
          value={timeText}
          onChange={(event) => setTimeText(event.target.value)}
          placeholder={t("form.when.detailPlaceholder")}
          maxLength={200}
          aria-label={t("form.when.detail")}
          className="h-12 rounded-2xl border-border bg-background text-base"
        />
      </Field>

      {/* Photo and voice sit side by side: they are two ways of doing the same optional thing, and
          putting them together says that neither is expected. */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={t("form.photo")} optional={t("form.optional")}>
          <PhotoField locale={locale} photo={photo} onPhoto={setPhoto} onRemove={() => setPhoto(null)} />
        </Field>

        <Field label={t("form.voice")} optional={t("form.optional")}>
          <VoiceRecorder locale={locale} note={voice} onNote={setVoice} />
        </Field>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-flame-tint px-4 py-3 text-sm text-flame-strong">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">{t("form.errorTitle")}: </strong>
            {error}
          </span>
        </p>
      ) : null}

      {/* The one action, with the reassurance beside it rather than buried above. */}
      <div className="flex flex-col-reverse items-center gap-4 border-t border-border pt-6 sm:flex-row sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {t("form.attachments", { n: MAX_FILES, mb: MAX_MB })}
        </p>
        <Button type="submit" size="lg" disabled={submitting} className="h-13 w-full rounded-full px-8 text-base sm:w-auto">
          {submitting ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Send className="size-5" aria-hidden />}
          {submitting ? t("form.submitting") : t("form.submit")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: string;
  children: React.ReactNode;
}) {
  return (
    // `min-w-0` matters in the two-column media row: a fieldset will not shrink below its
    // content's minimum width, and both a long filename and an <audio> element's intrinsic width
    // are larger than one column, so without it the columns overlap instead of truncating.
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1 flex w-full items-baseline gap-2">
        <span className="text-base font-semibold">{label}</span>
        {optional ? <span className="text-xs font-normal text-muted-foreground">{optional}</span> : null}
      </legend>
      {hint ? <p className="-mt-2 text-sm text-muted-foreground">{hint}</p> : null}
      {children}
    </fieldset>
  );
}
