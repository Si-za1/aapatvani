import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MODELS } from "@/config/models";
import { AiCallError, type EmbeddingResult, type Llm, type LlmRequest, type LlmResponse } from "./types";

// A guard around the model client for metered runs (a free-tier key, an evaluation, a demo).
//
// The free tier allows only a small number of requests per day per model, the real figure is not
// published and is not visible from the client, so this does not try to infer it. It does three
// things instead: space calls out, because a burst is what trips a per-minute limit; count every
// call in a daily ledger, so the spend is visible before it becomes an error; and stop before a
// configured budget rather than discovering the ceiling through a 429 halfway through a run.
//
// Counting is per model and per Pacific day, which is how Gemini's own RPD quota resets.

export interface QuotaOptions {
  /** Minimum gap between the start of one call and the next. 5 requests/minute is the free-tier figure for Flash, so 12 s is the safe default. */
  minIntervalMs?: number;
  /** Refuse the call that would exceed this many requests to one model in one day. */
  maxCallsPerModelPerDay?: number;
  /** Where the daily counters live. Defaults to `.data/quota-ledger.json`. */
  ledgerPath?: string;
  /** Progress output, called after each completed call. */
  onCall?: (info: QuotaCallInfo) => void;
}

export interface QuotaCallInfo {
  kind: "generate" | "embed";
  requested: string;
  answered: string;
  countForRequested: number;
  countForAnswered: number;
  waitedMs: number;
  latencyMs: number;
}

/** The next call would exceed the configured daily budget. Nothing was sent to the model. */
export class QuotaBudgetError extends Error {
  override name = "QuotaBudgetError";
  constructor(
    readonly model: string,
    readonly count: number,
    readonly budget: number,
  ) {
    super(
      `Daily budget reached for ${model}: ${count} of ${budget} requests already used today. ` +
        `Nothing was sent. Raise GEMINI_DAILY_BUDGET deliberately, or wait for the quota to reset at midnight Pacific.`,
    );
  }
}

type Ledger = Record<string, Record<string, number>>;

/** The Gemini quota day rolls over at midnight Pacific, not local time. */
export function quotaDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function readLedger(file: string): Ledger {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Ledger) : {};
  } catch {
    return {};
  }
}

function writeLedger(file: string, ledger: Ledger): void {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  } catch {
    // A read-only filesystem must not break a run; the counters are a convenience, not a control.
  }
}

export interface QuotaState {
  day: string;
  counts: Record<string, number>;
  budget: number;
}

export function readQuotaState(opts: QuotaOptions = {}): QuotaState {
  const day = quotaDay();
  const file = opts.ledgerPath ?? path.join(process.cwd(), ".data", "quota-ledger.json");
  return { day, counts: readLedger(file)[day] ?? {}, budget: opts.maxCallsPerModelPerDay ?? budgetFromEnv() };
}

function budgetFromEnv(): number {
  const raw = Number(process.env.GEMINI_DAILY_BUDGET);
  return Number.isFinite(raw) && raw > 0 ? raw : 15;
}

function intervalFromEnv(): number {
  const raw = Number(process.env.GEMINI_MIN_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 12_000;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wraps a model client so a run cannot quietly burn a metered quota. Returns an `Llm`, so
 * nothing downstream needs to know it is there.
 */
export function guardLlm(llm: Llm, opts: QuotaOptions = {}): Llm {
  const file = opts.ledgerPath ?? path.join(process.cwd(), ".data", "quota-ledger.json");
  const budget = opts.maxCallsPerModelPerDay ?? budgetFromEnv();
  const minInterval = opts.minIntervalMs ?? intervalFromEnv();
  let lastStart = 0;

  /** Reserves one request against `model`, refusing before it would exceed the budget. */
  const reserve = (model: string): number => {
    const day = quotaDay();
    const ledger = readLedger(file);
    const counts = (ledger[day] ??= {});
    const current = counts[model] ?? 0;
    if (current >= budget) throw new QuotaBudgetError(model, current, budget);
    counts[model] = current + 1;
    writeLedger(file, ledger);
    return counts[model];
  };

  const pace = async (): Promise<number> => {
    const waited = Math.max(0, lastStart + minInterval - Date.now());
    if (waited > 0) await sleep(waited);
    lastStart = Date.now();
    return waited;
  };

  return {
    backend: llm.backend,
    async generate(req: LlmRequest): Promise<LlmResponse> {
      const waitedMs = await pace();
      const countForRequested = reserve(req.model);
      const started = Date.now();
      try {
        const res = await llm.generate(req);
        // The response names the model that actually answered. If the client fell back, that is a
        // second real request against a second model's quota, so it has to be counted too.
        const countForAnswered =
          res.model === req.model ? countForRequested : reserve(res.model);
        opts.onCall?.({
          kind: "generate",
          requested: req.model,
          answered: res.model,
          countForRequested,
          countForAnswered,
          waitedMs,
          latencyMs: Date.now() - started,
        });
        return res;
      } catch (err) {
        // A failed call still spent a request. Record it, then let the caller see the failure.
        opts.onCall?.({
          kind: "generate",
          requested: req.model,
          answered: req.model,
          countForRequested,
          countForAnswered: countForRequested,
          waitedMs,
          latencyMs: Date.now() - started,
        });
        throw err;
      }
    },
    async embed(text: string): Promise<EmbeddingResult> {
      const model = MODELS.embedding;
      const waitedMs = await pace();
      const count = reserve(model);
      const started = Date.now();
      try {
        const res = await llm.embed(text);
        const countForAnswered = res.model === model ? count : reserve(res.model);
        opts.onCall?.({ kind: "embed", requested: model, answered: res.model, countForRequested: count, countForAnswered, waitedMs, latencyMs: Date.now() - started });
        return res;
      } catch (err) {
        opts.onCall?.({ kind: "embed", requested: model, answered: model, countForRequested: count, countForAnswered: count, waitedMs, latencyMs: Date.now() - started });
        throw err instanceof AiCallError ? err : new AiCallError(String(err));
      }
    },
  };
}
