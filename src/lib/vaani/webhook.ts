import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Webhook authentication.
 * Vaani documents HMAC-SHA256 signing (docs.vaanivoice.ai/api-reference/campaigns/webhooks):
 *   X-Vaani-Signature: sha256=<hex HMAC(secret, `${timestamp}.${rawBody}`)>
 *   X-Vaani-Timestamp: <unix seconds>, rejected if more than 5 minutes off.
 * Observed 2026-10-09: Vaani's agent-webhook "Test Connectivity" request carried NO signature headers
 * (only x-webhook-event), even with a signing secret configured. So:
 *   - If signature headers are present (and a secret is set), the HMAC MUST be valid. A bad signature is never rescued by a token.
 *   - If they are absent, the secret URL token (?token=VAANI_WEBHOOK_TOKEN) must match.
 * Unauthenticated requests are always rejected.
 */
export type AuthResult = { ok: true; method: "hmac" | "token" } | { ok: false; reason: string };

export function verifyVaaniRequest(opts: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  urlToken: string | null;
  secret?: string;
  token?: string;
  nowSec?: number;
}): AuthResult {
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const signed = Boolean(opts.signature || opts.timestamp);
  if (signed) {
    if (!opts.secret) return { ok: false, reason: "signed request but VAANI_WEBHOOK_SECRET not set" };
    if (!opts.signature || !opts.timestamp) return { ok: false, reason: "incomplete signature headers" };
    const ts = Number(opts.timestamp);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return { ok: false, reason: "stale or invalid timestamp" };
    const expected = "sha256=" + createHmac("sha256", opts.secret).update(`${opts.timestamp}.${opts.rawBody}`).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(opts.signature.trim());
    return a.length === b.length && timingSafeEqual(a, b) ? { ok: true, method: "hmac" } : { ok: false, reason: "bad signature" };
  }
  if (opts.token) {
    const a = Buffer.from(opts.token);
    const b = Buffer.from(opts.urlToken ?? "");
    return a.length === b.length && timingSafeEqual(a, b) ? { ok: true, method: "token" } : { ok: false, reason: "bad token" };
  }
  return { ok: false, reason: "unsigned request and VAANI_WEBHOOK_TOKEN not set" };
}

/** Lenient schemas matching the documented payloads (docs.vaanivoice.ai/guides/webhook-setup). Unknown fields pass through. */
const Lifecycle = z
  .object({
    event: z.enum(["call_started", "call_ringing", "user_picked_up_at", "call_rejected", "call_no_answer", "call_failed", "call_ended"]),
    room_name: z.string(),
    phone_number: z.string().optional(),
    status: z.string().optional(),
    call_duration: z.number().optional(), // seconds (call_ended)
    end_reason: z.string().optional(),
  })
  .passthrough();

const PostProcessing = z
  .object({
    event: z.literal("call_postprocessing"),
    call_id: z.string(),
    timestamp: z.string().optional(),
    data: z
      .object({
        room_name: z.string().optional(),
        call_id: z.string().optional(),
        call_duration: z.number().optional(), // milliseconds
        end_reason: z.string().optional(),
        summary: z.string().nullable().optional(),
        entities: z.unknown().optional(),
        dispositions: z.unknown().optional(),
        recording_url: z.string().nullable().optional(),
        transcript: z.string().nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const Other = z.object({ event: z.string() }).passthrough();

export const VaaniEvent = z.union([PostProcessing, Lifecycle, Other]);
export type VaaniEvent = z.infer<typeof VaaniEvent>;
export type VaaniPostProcessing = z.infer<typeof PostProcessing>;
export type VaaniLifecycle = z.infer<typeof Lifecycle>;

export const isPostProcessing = (e: VaaniEvent): e is VaaniPostProcessing => e.event === "call_postprocessing";
export const isLifecycle = (e: VaaniEvent): e is VaaniLifecycle => Lifecycle.safeParse(e).success;

/** The call identifier: lifecycle events carry room_name; postprocessing carries call_id (== room_name per docs example). */
export function eventCallId(e: VaaniEvent): string | null {
  if (isPostProcessing(e)) return e.call_id ?? e.data.call_id ?? e.data.room_name ?? null;
  const r = (e as { room_name?: unknown }).room_name;
  return typeof r === "string" ? r : null;
}
