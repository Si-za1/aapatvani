"use client";

// Reviewer sign-in (feature M12). Two modes, chosen by the deployment:
//
//   • firebase , production. Email and password through the Firebase client SDK; the ID token goes
//                 to the server, which exchanges it for an httpOnly session cookie.
//   • passcode , development and demos without a Firebase project. A shared passcode, checked on
//                 the server, producing the same kind of session.
//
// The password never touches our server in Firebase mode, only the token does.

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function firebaseIdToken(email: string, password: string, config: { apiKey?: string; authDomain?: string; projectId?: string; appId?: string }): Promise<string> {
  const { initializeApp, getApps } = await import("firebase/app");
  const { getAuth, signInWithEmailAndPassword } = await import("firebase/auth");
  const app = getApps()[0] ?? initializeApp(config);
  const credential = await signInWithEmailAndPassword(getAuth(app), email, password);
  return credential.user.getIdToken();
}

export function SignInForm({
  mode,
  firebaseConfig,
  demoHint,
  next,
}: {
  mode: "passcode" | "firebase";
  firebaseConfig?: { apiKey?: string; authDomain?: string; projectId?: string; appId?: string };
  demoHint?: string;
  next: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body =
        mode === "firebase"
          ? { mode: "firebase" as const, idToken: await firebaseIdToken(email, password, firebaseConfig ?? {}) }
          : { mode: "passcode" as const, passcode, name };

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? "Sign-in failed. Please try again.");
        setPending(false);
        return;
      }
      const target = params.get("next");
      router.push(target?.startsWith("/") ? target : next);
      router.refresh();
    } catch (err) {
      // Firebase reports bad credentials as a thrown error with a code, not a status.
      const code = (err as { code?: string }).code ?? "";
      setError(
        code.includes("invalid-credential") || code.includes("wrong-password")
          ? "That email and password do not match an account."
          : code.includes("user-not-found")
            ? "No account exists for that email."
            : code.includes("too-many-requests")
              ? "Too many attempts. Wait a moment and try again."
              : "Sign-in failed. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {mode === "passcode" ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="So decisions can be attributed to you"
              maxLength={60}
              autoComplete="name"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Recorded with every review you make, so the audit trail names a person.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="passcode">Reviewer passcode</Label>
            <Input
              id="passcode"
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              autoComplete="current-password"
              required
              className="h-11"
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="h-11"
            />
          </div>
        </>
      )}

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-flame-tint px-3 py-2 text-sm text-flame-strong">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="h-12 rounded-full text-base">
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        Sign in
      </Button>

      {mode === "passcode" && demoHint ? (
        <p className="rounded-xl bg-amber-tint px-3 py-2 text-center text-xs text-amber-strong">
          Demo reviewer passcode: <span className="font-mono font-semibold">{demoHint}</span>
        </p>
      ) : null}
    </form>
  );
}
