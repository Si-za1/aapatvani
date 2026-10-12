"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Signs out, then goes to the sign-in page. A plain HTML form post would work but would leave the
 * reviewer looking at a JSON response, so the call is made directly and the navigation is explicit.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => void signOut()}
      disabled={pending}
      className="size-8 rounded-full text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      title="Sign out"
    >
      <LogOut className="size-4" aria-hidden />
      <span className="sr-only">Sign out</span>
    </Button>
  );
}
