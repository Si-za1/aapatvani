import { Suspense } from "react";
import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { AppShell, PageHeader } from "@/components/av/app-shell";
import { SectionCard } from "@/components/av/cards";
import { SignOutRow } from "@/components/settings/sign-out-row";
import { DataLabelBadge } from "@/components/av/trust-labels";
import { getRegion } from "@/config/regions";
import { requireReviewer } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { loadManifest } from "@/lib/geo/dataset";
import { getReviewerPrefs } from "@/lib/prefs";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { formatDate } from "@/lib/time";

// Settings.
//
// Three things, and no more: what you can change, who you are signed in as, and what this
// deployment is actually made of.
//
// It used to be five cards. Store, Media and Sign-in named the backends a reviewer never chooses
// between; road kilometres, junction counts and settlement counts were dataset trivia dressed as
// facts about the deployment; and a paragraph explained that a session check happens on the server,
// which is not a setting and not something the reader can act on. A settings page carrying a
// description of its own architecture teaches people to stop reading it.
//
// What remains is what a reviewer can act on, plus the two honesty facts that a judge or a
// responder should be able to check: the reports are synthetic, and the map has known gaps.

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="h-[36rem] animate-pulse rounded-3xl bg-sand/60" aria-hidden />}>
      <Screen />
    </Suspense>
  );
}

async function Screen() {
  const reviewer = await requireReviewer("/settings");
  const prefs = await getReviewerPrefs();
  const env = getEnv();
  const region = getRegion(env.defaultRegionId);
  const manifest = await loadManifest(region.datasetIds[0]);

  return (
    <AppShell current="/settings" reviewer={reviewer}>
      <PageHeader title="Settings" description="Your two defaults, your account, and where the data comes from." />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <SectionCard title="Preferences" note="Saved to this browser">
            <PreferencesForm initial={prefs} />
          </SectionCard>

          <SectionCard title="Your account">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-leaf text-base font-bold text-leaf-strong">
                {reviewer.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{reviewer.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {reviewer.email ?? (reviewer.mode === "firebase" ? "Reviewer" : "Passcode reviewer")}
                </span>
              </span>
            </div>
            <SignOutRow />
          </SectionCard>
        </div>

        <SectionCard title="Where this data comes from">
          <dl className="flex flex-col divide-y divide-border/70 text-sm">
            <Row label="Area covered" value={manifest?.name ?? region.name} />
            <Row
              label="Reports"
              value={
                <span className="inline-flex items-center gap-2">
                  <DataLabelBadge label={env.defaultDataLabel} />
                  <span className="text-xs font-normal text-muted-foreground">over real geography</span>
                </span>
              }
            />
            {manifest ? (
              <Row
                label="Map data"
                value={
                  <span className="inline-flex flex-wrap items-center justify-end gap-2">
                    <span className="text-xs font-normal text-muted-foreground">
                      OpenStreetMap · {formatDate(manifest.snapshot, "UTC")}
                    </span>
                    <a
                      href="https://www.openstreetmap.org/copyright"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-4"
                    >
                      {manifest.license}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </span>
                }
              />
            ) : null}
          </dl>

          {manifest ? (
            <div className="mt-4 flex flex-col gap-2 border-t border-border/70 pt-4">
              <p className="text-xs font-semibold">Known gaps in this map</p>
              <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {manifest.knownLimitations.slice(0, 4).map((limitation) => (
                  <li key={limitation} className="flex gap-2">
                    <span aria-hidden className="text-border">
                      •
                    </span>
                    {limitation}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}
