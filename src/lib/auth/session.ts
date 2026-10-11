import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getEnv } from "@/lib/env";
import { getAdminApp } from "@/lib/firebase-admin";

export const SESSION_COOKIE = "av_session";
export const SESSION_MAX_AGE_S = 8 * 60 * 60;

export type Reviewer = {
  id: string;
  name: string;
  email?: string;
  mode: "firebase" | "passcode";
};

const DEV_SECRET = "aapatvani-local-development-secret-not-for-production";

function sessionSecret(): string | null {
  const env = getEnv();
  if (env.sessionSecret && env.sessionSecret.length >= 32) return env.sessionSecret;
  return env.isProduction ? null : DEV_SECRET;
}

export function reviewerPasscode(): string | null {
  const env = getEnv();
  if (env.reviewerPasscode) return env.reviewerPasscode;
  return env.isProduction ? null : "demo-reviewer";
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------- passcode mode

export function checkPasscode(candidate: string): boolean {
  const expected = reviewerPasscode();
  return Boolean(expected) && safeEqual(candidate, expected!);
}

export function createPasscodeSession(name: string): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET (32+ characters) is required in production");
  const cleanName = name.trim().slice(0, 60) || "Reviewer";
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "reviewer";
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ sub: `passcode:${slug}`, name: cleanName, iat: now, exp: now + SESSION_MAX_AGE_S }),
  ).toString("base64url");
  return `p.${payload}.${sign(payload, secret)}`;
}

function verifyPasscodeSession(token: string): Reviewer | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const [, payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(sign(payload, secret), signature)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub: string;
      name: string;
      exp: number;
    };
    if (data.exp * 1000 < Date.now()) return null;
    return { id: data.sub, name: data.name, mode: "passcode" };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Firebase mode

export async function createFirebaseSession(idToken: string): Promise<{ cookie: string; reviewer: Reviewer }> {
  const env = getEnv();
  const auth = getAuth(getAdminApp());
  const decoded = await auth.verifyIdToken(idToken, true);
  const email = decoded.email?.toLowerCase();
  const allowed = decoded.reviewer === true || (email !== undefined && env.reviewerEmails.includes(email));
  if (!allowed) throw new Error("This account is not an authorised reviewer.");
  const cookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_S * 1000 });
  return {
    cookie: `f.${cookie}`,
    reviewer: { id: decoded.uid, name: decoded.name ?? email ?? "Reviewer", email, mode: "firebase" },
  };
}

async function verifyFirebaseSession(token: string): Promise<Reviewer | null> {
  try {
    const env = getEnv();
    const decoded = await getAuth(getAdminApp()).verifySessionCookie(token.slice(2), true);
    const email = decoded.email?.toLowerCase();
    const allowed = decoded.reviewer === true || (email !== undefined && env.reviewerEmails.includes(email));
    if (!allowed) return null;
    return { id: decoded.uid, name: decoded.name ?? email ?? "Reviewer", email, mode: "firebase" };
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string | undefined): Promise<Reviewer | null> {
  if (!token) return null;
  const mode = getEnv().authMode;
  if (token.startsWith("p.") && mode === "passcode") return verifyPasscodeSession(token);
  if (token.startsWith("f.") && mode === "firebase") return verifyFirebaseSession(token);
  return null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getEnv().isProduction,
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  };
}
