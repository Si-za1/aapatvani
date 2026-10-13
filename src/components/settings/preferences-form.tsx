"use client";

// The two preferences a reviewer can change, and nothing else.
//
// They are deliberately small: a setting that does not change something real is a lie told in a
// dropdown. Both of these change where a shift starts, and both are read by the pages themselves.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QUEUE_CHOICES, WINDOW_CHOICES, type ReviewerPrefs } from "@/lib/pref-choices";
import { cn } from "@/lib/utils";

export function PreferencesForm({ initial }: { initial: ReviewerPrefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const dirty = prefs.windowHours !== initial.windowHours || prefs.queue !== initial.queue;

  async function save() {
    setState("saving");
    const response = await fetch("/api/prefs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(prefs),
    }).catch(() => null);

    if (!response?.ok) {
      setState("error");
      return;
    }
    setState("saved");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2.5">
        <legend className="text-sm font-semibold">Where the overview opens</legend>
        <p className="text-xs text-muted-foreground">
          The time window the overview and its map start on. Choosing one in the filters only changes the view you
          are looking at; this changes what you land on.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {WINDOW_CHOICES.map((choice) => {
            const active = prefs.windowHours === choice.hours;
            return (
              <button
                key={choice.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setState("idle");
                  setPrefs((current) => ({ ...current, windowHours: choice.hours }));
                }}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                  active
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-accent",
                )}
              >
                {choice.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="text-sm font-semibold">Where the review queue opens</legend>
        <p className="text-xs text-muted-foreground">
          What the Reports page shows before anyone touches its filters.
        </p>
        <div className="mt-1 flex flex-col gap-2">
          {QUEUE_CHOICES.map((choice) => {
            const active = prefs.queue === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setState("idle");
                  setPrefs((current) => ({ ...current, queue: choice.value }));
                }}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                  active ? "border-leaf bg-leaf-tint/60" : "border-border bg-card hover:bg-accent",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                    active ? "border-leaf-strong bg-leaf-strong text-white" : "border-input",
                  )}
                >
                  {active ? <Check className="size-3" /> : null}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{choice.label}</span>
                  <span className="text-xs text-muted-foreground">{choice.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void save()} disabled={!dirty || state === "saving"} className="rounded-full">
          {state === "saving" ? "Saving…" : "Save preferences"}
        </Button>
        {state === "saved" && !dirty ? (
          <span className="text-xs font-medium text-leaf-strong">Saved.</span>
        ) : null}
        {state === "error" ? (
          <span className="text-xs font-medium text-flame-strong">That did not save. Try again.</span>
        ) : null}
      </div>
    </div>
  );
}
