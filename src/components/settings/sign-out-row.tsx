"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSignOut } from "@/components/av/use-sign-out";

/** Signing out, from the settings page. The profile menu does the same thing from anywhere. */
export function SignOutRow() {
  const { signOut, pending } = useSignOut();

  return (
    <div className="mt-4 border-t border-border/70 pt-4">
      <Button
        type="button"
        variant="outline"
        onClick={() => void signOut()}
        disabled={pending}
        className="rounded-full"
      >
        <LogOut className="size-4" aria-hidden />
        {pending ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
