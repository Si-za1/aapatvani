"use client";

// Switches the public pages between Nepali and English. The choice is written to a cookie and the
// server re-renders, so there is one source of truth for the language rather than a client state
// that disagrees with what the server sent.

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Written at module scope: mutating a browser global is not something a component body may do, and
// the cookie write has nothing to do with rendering.
function writeLocaleCookie(next: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

export function LanguageToggle({ locale, className }: { locale: Locale; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    writeLocaleCookie(next);
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-card p-1", className)}
    >
      {LOCALES.map((option) => {
        const active = option.code === locale;
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => choose(option.code)}
            aria-pressed={active}
            disabled={pending}
            lang={option.code}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {option.native}
          </button>
        );
      })}
    </div>
  );
}
