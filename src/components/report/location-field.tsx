"use client";

// Where the incident is (feature M1). Three ways in, and the reporter can always say "I do not
// know": project.md §3 rule 3 is that coordinates come only from GPS, a dropped pin or a gazetteer
// match, so nothing here ever guesses a position from the text.

import dynamic from "next/dynamic";
import { useState } from "react";
import { Crosshair, LoaderCircle, MapPin, PencilLine, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { translator, type Locale } from "@/lib/i18n";
import type { LatLng, LocationSource } from "@/lib/domain/schemas";

const MapPinPicker = dynamic(() => import("./map-pin-picker"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-2xl border border-border bg-sand" />,
});

export interface LocationValue {
  source: LocationSource;
  point: LatLng | null;
  accuracyM: number | null;
  placeText: string;
}

export const EMPTY_LOCATION: LocationValue = { source: "none", point: null, accuracyM: null, placeText: "" };

export function LocationField({
  locale,
  value,
  onChange,
  center,
  zoom,
  tileUrl,
  attribution,
}: {
  locale: Locale;
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  center: [number, number];
  zoom: number;
  tileUrl: string;
  attribution: string;
}) {
  const t = translator(locale);
  const [mode, setMode] = useState<LocationSource | null>(value.source === "none" ? null : value.source);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseMode(next: LocationSource | null) {
    setError(null);
    setMode(next);
    if (next === null) onChange(EMPTY_LOCATION);
    else if (next === "place_name") onChange({ ...EMPTY_LOCATION, source: "place_name", placeText: value.placeText });
    else if (next === "pin") onChange({ ...EMPTY_LOCATION, source: "pin", point: value.point });
    else onChange({ ...EMPTY_LOCATION, source: "gps" });
  }

  function locateMe() {
    setMode("gps");
    if (!navigator.geolocation) {
      setError(t("form.where.gpsFailed"));
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({
          source: "gps",
          point: { lat: position.coords.latitude, lng: position.coords.longitude },
          accuracyM: Math.round(position.coords.accuracy),
          placeText: "",
        });
      },
      () => {
        setLocating(false);
        setError(t("form.where.gpsFailed"));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const options: Array<{ key: LocationSource; label: string; icon: React.ReactNode }> = [
    { key: "gps", label: t("form.where.gps"), icon: <Crosshair className="size-4" /> },
    { key: "pin", label: t("form.where.pin"), icon: <MapPin className="size-4" /> },
    { key: "place_name", label: t("form.where.place"), icon: <PencilLine className="size-4" /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => (option.key === "gps" ? locateMe() : chooseMode(option.key))}
            aria-pressed={mode === option.key}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
              mode === option.key
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-accent",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => chooseMode(null)}
          aria-pressed={mode === null}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
            mode === null ? "border-transparent bg-stone text-stone-strong" : "border-border bg-card text-muted-foreground hover:bg-accent",
          )}
        >
          {t("form.where.none")}
        </button>
      </div>

      {locating ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {t("form.where.gps")}…
        </p>
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 rounded-xl bg-butter-tint px-3 py-2 text-sm text-butter-strong">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {mode === "gps" && value.point ? (
        <Located
          label={t("form.where.gpsFound")}
          detail={value.accuracyM ? t("form.where.accuracy", { m: value.accuracyM }) : undefined}
          onClear={() => chooseMode(null)}
          clearLabel={t("form.where.clear")}
        />
      ) : null}

      {mode === "pin" ? (
        <div className="flex flex-col gap-2">
          <MapPinPicker
            center={center}
            zoom={zoom}
            value={value.point}
            onPick={(point) => onChange({ source: "pin", point, accuracyM: null, placeText: "" })}
            tileUrl={tileUrl}
            attribution={attribution}
            label={t("form.where.pin")}
          />
          {value.point ? (
            <Located
              label={`${value.point.lat.toFixed(5)}, ${value.point.lng.toFixed(5)}`}
              onClear={() => onChange({ source: "pin", point: null, accuracyM: null, placeText: "" })}
              clearLabel={t("form.where.clear")}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("form.whereHint")}</p>
          )}
        </div>
      ) : null}

      {mode === "place_name" ? (
        <Input
          value={value.placeText}
          onChange={(event) => onChange({ source: "place_name", point: null, accuracyM: null, placeText: event.target.value })}
          placeholder={t("form.where.placePlaceholder")}
          maxLength={200}
          lang={locale}
          className="h-12 rounded-xl text-base"
        />
      ) : null}
    </div>
  );
}

function Located({
  label,
  detail,
  onClear,
  clearLabel,
}: {
  label: string;
  detail?: string;
  onClear: () => void;
  clearLabel: string;
}) {
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-xl bg-river-tint px-3 py-2 text-sm text-river-strong">
      <MapPin className="size-4 shrink-0" aria-hidden />
      <span className="font-medium">{label}</span>
      {detail ? <span className="text-river-strong/80">{detail}</span> : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="ml-auto h-7 rounded-full px-2 text-river-strong hover:bg-river/30"
      >
        <X className="size-3.5" aria-hidden />
        {clearLabel}
      </Button>
    </p>
  );
}
