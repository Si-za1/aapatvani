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
      router.push("/login");
      router.refresh();
    }
  }

  return { signOut, pending };
}
