import { knowledge as defaultKb, buildScorerSystemPrompt, type KnowledgeBase, type PromptConfig, DEFAULT_PROMPT_CONFIG } from "../knowledge";
import { ApiError } from "@google/genai";
import { generateJson, type ModelTier } from "../llm/gemini";
import { scanAgentTurnsForPricing, type PricingHit } from "../guardrail/pricing";
import { parseTranscript, renderTranscript, type Turn } from "../transcript";
import { ModelVerdict, modelVerdictJsonSchema, type Verdict } from "./schema";
import { computeScore, deriveOutcome } from "./rubric";

export class ScorerError extends Error {
  constructor(message: string, readonly attempts: { raw: string; error: string }[]) {
    super(message);
  }
}

export type ScoreResult = {
  verdict: Verdict;
  pricingBreach: boolean;
  pricingHits: PricingHit[];
  knowledgeVersion: string;
  model: string;
  modelVersion?: string;
  attempts: number;
  usage: { inputTokens: number; outputTokens: number; thinkingTokens: number };
};

/**
 * Post-call scorer. Input: one or more calls from the same caller (dropped-call merge passes several).
 * 1. Deterministic pricing guardrail on AGENT turns.
 * 2. Gemini returns strict JSON → zod-validated; on parse/validation failure, retry ONCE with the error.
 * 3. Deterministic rubric decides the final outcome and score.
 */
export async function scoreCall(input: {
  transcripts: (string | Turn[])[];
  config?: Partial<PromptConfig>;
  tier?: ModelTier;
  kb?: KnowledgeBase;
  nowIso?: string;
}): Promise<ScoreResult> {
  const kb = input.kb ?? defaultKb;
  const cfg = { ...DEFAULT_PROMPT_CONFIG, ...input.config };
  const calls = input.transcripts.map((t) => (typeof t === "string" ? parseTranscript(t) : t));
  const allTurns = calls.flat();

  const pricingHits = scanAgentTurnsForPricing(allTurns);

  const rendered = calls.map((turns, i) => (calls.length > 1 ? `--- CALL ${i + 1} of ${calls.length} ---\n` : "") + renderTranscript(turns)).join("\n\n");
  const user = `Today's date: ${(input.nowIso ?? new Date().toISOString()).slice(0, 10)}.
${calls.length > 1 ? "These calls came from the same number within minutes (e.g. a dropped call). Treat them as ONE enquiry.\n" : ""}
TRANSCRIPT:
${rendered}`;
  const system = buildScorerSystemPrompt(kb, cfg);

  const attempts: { raw: string; error: string }[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
  let model = "";
  let modelVersion: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const retryNote = attempts.length
      ? `\n\nYOUR PREVIOUS RESPONSE WAS INVALID: ${attempts[attempts.length - 1].error}\nReturn corrected JSON only.`
      : "";
    const res = await generateWithFallback(input.tier ?? "smart", { system, user: user + retryNote, jsonSchema: modelVerdictJsonSchema });
    model = res.model;
    modelVersion = res.modelVersion;
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
    usage.thinkingTokens += res.usage.thinkingTokens;

    let parsed: ModelVerdict;
    try {
      parsed = ModelVerdict.parse(JSON.parse(stripFences(res.text)));
    } catch (e) {
      attempts.push({ raw: res.text, error: e instanceof Error ? e.message.slice(0, 1500) : String(e) });
      continue;
    }

    const { outcome, trace } = deriveOutcome(parsed);
    const { score, breakdown } = computeScore(parsed, cfg.minWeeksRunway);
    const pricingBreach = pricingHits.length > 0;
    if (parsed.agent_pricing_violation && !pricingBreach) trace.push("model reports agent pricing violation; regex found none (check manually)");

    return {
      verdict: { ...parsed, outcome, model_outcome: parsed.outcome, rule_trace: trace, score_0_100: score, score_breakdown: breakdown },
      pricingBreach: pricingBreach || parsed.agent_pricing_violation,
      pricingHits,
      knowledgeVersion: kb.version,
      model,
      modelVersion,
      attempts: attempt,
      usage,
    };
  }
  throw new ScorerError("Scorer returned invalid JSON twice", attempts);
}

const isTransient = (e: unknown) =>
  (e instanceof ApiError && (e.status >= 500 || e.status === 429)) || (e instanceof Error && /timeout|timed out|ECONNRESET|fetch failed/i.test(e.message));

/** Transient API failure (5xx/429/timeout): retry once on the same tier, then once on the other tier. Non-transient errors throw immediately. */
async function generateWithFallback(tier: ModelTier, req: { system: string; user: string; jsonSchema: unknown }) {
  const plan: ModelTier[] = [tier, tier, tier === "smart" ? "fast" : "smart"];
  let last: unknown;
  for (const t of plan) {
    try {
      return await generateJson({ tier: t, ...req });
    } catch (e) {
      if (!isTransient(e)) throw e;
      last = e;
    }
  }
  throw last;
}

function stripFences(s: string) {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
