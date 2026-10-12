import { z } from "zod";

// Converts a Zod schema into the JSON Schema subset Gemini accepts for `responseJsonSchema`.
// The same Zod schema then validates the response, so the contract is defined once.

const ALLOWED_KEYS = new Set([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "description",
  "title",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "format",
  "additionalProperties",
]);

const SAFE_INTEGER_BOUND = Number.MAX_SAFE_INTEGER;

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    // Zod adds ±MAX_SAFE_INTEGER bounds to integers; they carry no meaning for the model.
    if ((key === "minimum" || key === "maximum") && Math.abs(value as number) >= SAFE_INTEGER_BOUND) continue;
    if (key === "properties") {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitize(v)]),
      );
    } else if (key === "items" || key === "additionalProperties") {
      out[key] = typeof value === "boolean" ? value : sanitize(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  return sanitize(json) as Record<string, unknown>;
}

/** Every key used anywhere in a schema, used by tests to prove only supported keywords appear. */
export function schemaKeys(node: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => schemaKeys(n, keys));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "properties") {
        keys.add(key);
        Object.values(value as Record<string, unknown>).forEach((v) => schemaKeys(v, keys));
      } else {
        keys.add(key);
        schemaKeys(value, keys);
      }
    }
  }
  return keys;
}
