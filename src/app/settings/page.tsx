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
// Two real preferences, and then everything a person might reasonably want to know about the
// deployment they are signed in to: which area is actually covered, what the data is, where it is
// kept, and what this tool refuses to do. It is the page a judge lands on to check whether the
// thing is honest, so it says the uncomfortable parts too.

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
      <PageHeader
        title="Settings"
        description="Your preferences, and what this deployment is made of. Nothing here changes what you are allowed to see."
      />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <SectionCard title="Preferences" note="Saved to this browser">
            <PreferencesForm initial={prefs} />
          </SectionCard>

          <SectionCard title="This deployment">
            <dl className="flex flex-col divide-y divide-border/70 text-sm">
              <Row label="Area covered" value={manifest?.name ?? region.name} />
              {manifest ? (
                <Row label="Map snapshot" value={`${formatDate(manifest.snapshot, "UTC")} · OpenStreetMap`} />
              ) : null}
              <Row
                label="Reports"
                value={
                  <span className="inline-flex items-center gap-2">
                    <DataLabelBadge label={env.defaultDataLabel} />
                    <span className="text-xs text-muted-foreground">over real geography</span>
                  </span>
                }
              />
              <Row label="Store" value={env.dataBackend === "firestore" ? "Firestore" : "Local file store"} />
              <Row label="Media" value={env.mediaBackend === "gcs" ? "Cloud Storage" : "Local disk"} />
              <Row label="Sign-in" value={env.authMode === "firebase" ? "Firebase Authentication" : "Shared passcode"} />
            </dl>
          </SectionCard>
        </div>

        <div className="flex flex-col gap-5">
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
            <p className="mt-4 text-xs text-muted-foreground">
              {reviewer.mode === "firebase"
                ? "Signed in with Firebase Authentication. Reviewer pages are reachable only with a valid session, and the check happens on the server for every request."
                : "Signed in with the shared passcode for this deployment. Reviewer pages are reachable only with a valid session, and the check happens on the server for every request."}
            </p>
            <SignOutRow />
          </SectionCard>

          {manifest ? (
            <SectionCard title="What the map is made of">
              <dl className="flex flex-col divide-y divide-border/70 text-sm">
                <Row
                  label="Road network"
                  value={`${manifest.stats.roadKm.toLocaleString("en-GB")} km · ${manifest.stats.nodes.toLocaleString("en-GB")} junctions`}
                />
                <Row
                  label="Health facilities"
                  value={`${manifest.stats.healthFacilities} mapped, ${manifest.stats.hospitals} of them hospitals`}
                />
                <Row label="Settlements" value={`${manifest.stats.settlements} named places`} />
                <Row
                  label="Licence"
                  value={
                    <a
                      href="https://www.openstreetmap.org/copyright"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-4"
                    >
                      {manifest.license}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  }
                />
              </dl>

              <div className="mt-4 flex flex-col gap-2">
                <p className="text-xs font-semibold">Known gaps in this data</p>
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
            </SectionCard>
          ) : null}
        </div>
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
