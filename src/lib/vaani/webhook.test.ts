import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eventCallId, isPostProcessing, VaaniEvent, verifyVaaniRequest } from "./webhook";
import { parseTranscript } from "../transcript";

const secret = "test_secret";
const body = JSON.stringify({ event: "call_ended", room_name: "room_123abc", call_duration: 42.5 });
const now = 1_790_000_000;
const sign = (ts: number, b = body, s = secret) => "sha256=" + createHmac("sha256", s).update(`${ts}.${b}`).digest("hex");

describe("verifyVaaniRequest", () => {
  it("accepts a valid HMAC signature", () => {
    expect(verifyVaaniRequest({ rawBody: body, signature: sign(now), timestamp: String(now), urlToken: null, secret, nowSec: now })).toEqual({ ok: true, method: "hmac" });
  });
  it("rejects a tampered body", () => {
    expect(verifyVaaniRequest({ rawBody: body + " ", signature: sign(now), timestamp: String(now), urlToken: null, secret, nowSec: now }).ok).toBe(false);
  });
  it("rejects a replay older than 5 minutes", () => {
    const ts = now - 301;
    expect(verifyVaaniRequest({ rawBody: body, signature: sign(ts), timestamp: String(ts), urlToken: null, secret, nowSec: now }).ok).toBe(false);
  });
  it("rejects a wrong secret", () => {
    expect(verifyVaaniRequest({ rawBody: body, signature: sign(now, body, "other"), timestamp: String(now), urlToken: null, secret, nowSec: now }).ok).toBe(false);
  });
  it("requires the signature when a secret is configured, even if a token is present", () => {
    expect(verifyVaaniRequest({ rawBody: body, signature: null, timestamp: null, urlToken: "tok", secret, token: "tok", nowSec: now }).ok).toBe(false);
  });
  it("falls back to URL token when no secret is configured", () => {
    expect(verifyVaaniRequest({ rawBody: body, signature: null, timestamp: null, urlToken: "tok", token: "tok" }).ok).toBe(true);
    expect(verifyVaaniRequest({ rawBody: body, signature: null, timestamp: null, urlToken: "nope", token: "tok" }).ok).toBe(false);
  });
  it("rejects everything when nothing is configured", () => {
    expect(verifyVaaniRequest({ rawBody: body, signature: null, timestamp: null, urlToken: null }).ok).toBe(false);
  });
});

describe("Vaani payloads (shapes from docs.vaanivoice.ai/guides/webhook-setup)", () => {
  const post = {
    event: "call_postprocessing",
    call_id: "outbound-1784899978-36cec598",
    timestamp: "2026-07-24T13:34:22.278854+00:00",
    data: {
      room_name: "outbound-1784899978-36cec598",
      call_id: "outbound-1784899978-36cec598",
      call_duration: 55150.02,
      end_reason: "Call ended",
      summary: "…",
      entities: { name: "Ayush Awasthi" },
      dispositions: { acas: "Name Collected" },
      recording_url: "https://example/api/stream/x",
      transcript: "[13:33:14] AGENT: Hi! you have reached our customer service.\n\n[13:33:19] USER: Yeah. How are you?\n\n[13:33:31] AGENT: I am doing great.",
    },
  };

  it("parses call_postprocessing and finds the call id", () => {
    const e = VaaniEvent.parse(post);
    expect(isPostProcessing(e)).toBe(true);
    expect(eventCallId(e)).toBe("outbound-1784899978-36cec598");
  });

  it("parses lifecycle events by room_name", () => {
    const e = VaaniEvent.parse({ event: "call_started", room_name: "room_123abc", status: "dialing", phone_number: "+1234567890" });
    expect(eventCallId(e)).toBe("room_123abc");
  });

  it("parses Vaani's timestamped AGENT/USER transcript into turns", () => {
    const turns = parseTranscript(post.data.transcript);
    expect(turns.map((t) => t.speaker)).toEqual(["agent", "caller", "agent"]);
    expect(turns[1].text).toBe("Yeah. How are you?");
  });
});
