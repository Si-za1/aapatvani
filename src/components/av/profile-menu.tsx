"use client";

// Who is signed in, and the two things they can do about it.
//
// The reviewer's own menu sits at the foot of the sidebar, under the destinations rather than among
// them: Overview and Incidents are places the work is, this is a place the person is. Settings and
// signing out both live here, and the gear in the top bar is a second way to reach the first,
// because a setting nobody can find is a setting that does not exist.

import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Reviewer } from "@/lib/auth";
import { useSignOut } from "@/components/av/use-sign-out";

export function ProfileMenu({ reviewer }: { reviewer: Reviewer }) {
  const { signOut, pending } = useSignOut();
  const initial = reviewer.name.slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2.5 rounded-2xl px-1.5 py-2 text-left transition-colors hover:bg-sidebar-accent lg:px-2 lg:py-2.5"
        title={reviewer.name}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-leaf text-sm font-bold text-leaf-strong">
          {initial}
        </span>
        <span className="hidden min-w-0 flex-1 flex-col lg:flex">
          <span className="truncate text-sm font-semibold">{reviewer.name}</span>
          <span className="truncate text-[11px] text-sidebar-foreground/55">
            {reviewer.mode === "firebase" ? "Google account" : "Passcode reviewer"}
          </span>
        </span>
        <ChevronsUpDown className="hidden size-4 shrink-0 text-sidebar-foreground/45 lg:block" aria-hidden />
        <span className="sr-only">Your account</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-60">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-leaf-tint text-sm font-bold text-leaf-strong">
            {initial}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{reviewer.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {reviewer.email ?? (reviewer.mode === "firebase" ? "Reviewer" : "Passcode reviewer")}
            </span>
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center gap-2">
            <Settings className="size-4" aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/activity" className="flex items-center gap-2">
            <UserRound className="size-4" aria-hidden />
            Your activity
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Not styled as destructive: flame is the critical-warning colour in this palette, and
            signing out is not a warning. The icon and the word carry it. */}
        <DropdownMenuItem
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
          className="flex items-center gap-2"
        >
          <LogOut className="size-4" aria-hidden />
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
