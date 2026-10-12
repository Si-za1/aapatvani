import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n";

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
