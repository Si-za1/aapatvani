"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Signing out, in one place. Two controls do it, the profile menu and the settings page, and a
 * second copy of the sequence is a second place for the redirect to be forgotten.
 */
export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } finally {
      // Out to the public homepage, not to the sign-in screen. A reviewer who has just finished a
      // shift is done with this app, not queuing to get back in, and landing on a password box reads
      // as "you were disconnected" rather than "you are finished".
      router.push("/");
      router.refresh();
    }
  }

  return { signOut, pending };
}
