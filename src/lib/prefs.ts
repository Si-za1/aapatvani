import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n";
import { parsePrefs, type ReviewerPrefs } from "@/lib/pref-choices";

// The reporter's language preference, read on the server so the public pages come back in the
// language they chose last time. The cookie name and lifetime live in lib/i18n.ts, because the
// toggle that writes the cookie is a Client Component and cannot import this file.

/**
 * The language to render public pages in. Nepali is the default: the people this tool is for read
 * Nepali first, and English is the fallback rather than the assumption.
 */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "ne";
}

// ---------------------------------------------------------------- reviewer preferences
//
// Two settings a reviewer can actually change, both about where a shift starts rather than about
// what the app does. They are cookies, not records: losing one costs a click, so it does not belong
// in the database, and nothing here changes what any reviewer is allowed to see. The choices
// themselves live in lib/pref-choices.ts, which the settings form can also import.

export const PREFS_COOKIE = "av_prefs";

export async function getReviewerPrefs(): Promise<ReviewerPrefs> {
  return parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
}
