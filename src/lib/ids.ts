import { createHash, randomBytes } from "node:crypto";

// Crockford base32 without ambiguous characters (no I, L, O, U).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomString(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Sortable-ish id with a readable prefix, e.g. "rep_01K9…". */
export function newId(prefix: string): string {
  const time = Date.now().toString(36).toUpperCase().padStart(9, "0");
  return `${prefix}_${time}${randomString(8)}`;
}

/** Short code shown to reporters, e.g. "AV-7K3Q9P". */
export function newReferenceCode(): string {
  return `AV-${randomString(6)}`;
}

/** Secret handed to the submitting browser so only it can trigger extraction. */
export function newSecret(): string {
  return randomBytes(24).toString("base64url");
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Deterministic id derived from content, for de-duplicating system-generated records. */
export function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${sha256Hex(parts.join("|")).slice(0, 20)}`;
}
