import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPasscode, createPasscodeSession, verifySessionToken } from "@/lib/auth/session";

describe("passcode sessions", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_MODE", "passcode");
    vi.stubEnv("SESSION_SECRET", "a-test-secret-that-is-at-least-32-characters-long");
    vi.stubEnv("REVIEWER_PASSCODE", "correct horse");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("accepts the right passcode only", () => {
    expect(checkPasscode("correct horse")).toBe(true);
    expect(checkPasscode("wrong")).toBe(false);
  });

  it("signs and verifies a session", async () => {
    const token = createPasscodeSession("Sita Rai");
    const reviewer = await verifySessionToken(token);
    expect(reviewer).toEqual({ id: "passcode:sita-rai", name: "Sita Rai", mode: "passcode" });
  });

  it("rejects tampered tokens", async () => {
    const token = createPasscodeSession("Sita Rai");
    const [prefix, payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "passcode:admin", name: "Admin", exp: 9999999999 })).toString("base64url");
    expect(await verifySessionToken(`${prefix}.${forged}.${signature}`)).toBeNull();
    expect(await verifySessionToken(`${prefix}.${payload}.x${signature.slice(1)}`)).toBeNull();
    expect(await verifySessionToken("garbage")).toBeNull();
  });

  it("rejects expired sessions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T08:00:00Z"));
    const token = createPasscodeSession("Sita Rai");
    vi.setSystemTime(new Date("2026-10-11T17:00:00Z"));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects sessions signed with another secret", async () => {
    const token = createPasscodeSession("Sita Rai");
    vi.stubEnv("SESSION_SECRET", "a-different-secret-that-is-also-32-characters-long");
    expect(await verifySessionToken(token)).toBeNull();
  });
});
