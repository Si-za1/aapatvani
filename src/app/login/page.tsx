import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getReviewer } from "@/lib/auth";
import { getEnv } from "@/lib/env";

// Reviewer sign-in. Deliberately outside the shell: there is no navigation to offer until someone
// is signed in.

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-sand" aria-hidden />}>
        <Screen />
      </Suspense>
    </main>
  );
}

async function Screen() {
  const existing = await getReviewer();
  if (existing) redirect("/dashboard");

  const env = getEnv();

  return (
    <>
      <Link href="/" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink-soft hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        Back to the public site
      </Link>

      <Card className="gap-5 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Reviewer sign-in</h1>
          <p className="text-sm text-muted-foreground">
            Reports and incident workspaces are for responders. The public report form needs no account.
          </p>
        </div>

        <SignInForm
          mode={env.authMode}
          firebaseConfig={env.firebaseWeb}
          demoHint={env.demoLoginHint ?? (env.authMode === "passcode" && !env.isProduction ? "demo-reviewer" : undefined)}
          next="/dashboard"
        />

        <p className="text-xs text-muted-foreground">
          {env.authMode === "firebase"
            ? "Accounts are managed in Firebase Authentication."
            : "This deployment uses a shared passcode. Set AUTH_MODE=firebase with a Firebase project to use real accounts."}
        </p>
      </Card>

      <Button asChild variant="ghost" className="rounded-full">
        <Link href="/report">Report an incident instead</Link>
      </Button>
    </>
  );
}
