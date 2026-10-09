import { ApiError, GoogleGenAI } from "@google/genai";

/**
 * Thin wrapper over the official @google/genai SDK.
 * Model IDs come only from env (GEMINI_MODEL_FAST / GEMINI_MODEL_SMART), never hardcoded.
 * Falls back to GEMINI_API_KEY_BACKUP on auth/quota errors.
 */

export type ModelTier = "fast" | "smart";

export function modelId(tier: ModelTier): string {
  const id = tier === "fast" ? process.env.GEMINI_MODEL_FAST : process.env.GEMINI_MODEL_SMART;
  if (!id) throw new Error(`GEMINI_MODEL_${tier.toUpperCase()} is not set`);
  return id;
}

const clients = new Map<string, GoogleGenAI>();
function client(apiKey: string) {
  let c = clients.get(apiKey);
  if (!c) {
    c = new GoogleGenAI({ apiKey, httpOptions: { timeout: 90_000 } });
    clients.set(apiKey, c);
  }
  return c;
}

export type JsonCallResult = {
  text: string;
  model: string;
  modelVersion: string | undefined;
  usage: { inputTokens: number; outputTokens: number; thinkingTokens: number };
  usedBackupKey: boolean;
};

export async function generateJson(opts: {
  tier: ModelTier;
  system: string;
  user: string;
  jsonSchema: unknown;
}): Promise<JsonCallResult> {
  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_BACKUP].filter(Boolean) as string[];
  if (!keys.length) throw new Error("GEMINI_API_KEY is not set");
  const model = modelId(opts.tier);

  let lastErr: unknown;
  for (const [i, key] of keys.entries()) {
    try {
      const res = await client(key).models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: opts.jsonSchema,
          temperature: 0,
        },
      });
      const u = res.usageMetadata;
      return {
        text: res.text ?? "",
        model,
        modelVersion: res.modelVersion,
        usage: {
          inputTokens: u?.promptTokenCount ?? 0,
          outputTokens: u?.candidatesTokenCount ?? 0,
          thinkingTokens: u?.thoughtsTokenCount ?? 0,
        },
        usedBackupKey: i > 0,
      };
    } catch (e) {
      lastErr = e;
      const retryWithBackup = e instanceof ApiError && [401, 403, 429].includes(e.status);
      if (!retryWithBackup) throw e;
    }
  }
  throw lastErr;
}
