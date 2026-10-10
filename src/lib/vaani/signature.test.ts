import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeEvents, verifyVaaniRequest, verifyWebhookSignature } from "./webhook";

const secret = "a-real-secret";
const body = JSON.stringify({ event: "webhook_test", timestamp: "2026-10-10T09:14:41Z", events: [] });
const hmac = (b: string, k = secret) => "sha256=" + createHmac("sha256", k).update(b).digest("hex");

describe("x-webhook-signature (observed Vaani format: sha256=HMAC(secret, rawBody))", () => {
  it("accepts a correct signature, with or without the prefix", () => {
    expect(verifyWebhookSignature(body, hmac(body), secret)).toBe(true);
    expect(verifyWebhookSignature(body, hmac(body).replace("sha256=", ""), secret)).toBe(true);
  });
  it("rejects wrong key or tampered body", () => {
    expect(verifyWebhookSignature(body, hmac(body, "other"), secret)).toBe(false);
    expect(verifyWebhookSignature(body + " ", hmac(body), secret)).toBe(false);
  });
  it("verifyVaaniRequest uses it, and a bad one is not rescued by a valid URL token", () => {
    const base = { rawBody: body, signature: null, timestamp: null, urlToken: "tok", secret, token: "tok" };
    expect(verifyVaaniRequest({ ...base, webhookSignature: hmac(body) }).ok).toBe(true);
    expect(verifyVaaniRequest({ ...base, webhookSignature: hmac(body, "other") }).ok).toBe(false);
  });
});

describe("normalizeEvents", () => {
  it("handles the batched test payload shape and hoists data fields", () => {
    const events = normalizeEvents({
      event: "webhook_test",
      events: [
        { event: "call_ended", timestamp: "t", data: { room_name: "test_room_123", call_id: "test_room_123", call_duration: 120 } },
        { event: "call_postprocessing", call_id: "test_room_123", timestamp: "t", data: { room_name: "test_room_123", call_id: "test_room_123", call_duration: 120000, transcript: "[00:00:01] AGENT: Hi" } },
      ],
    });
    expect(events.map((e) => e.event)).toEqual(["call_ended", "call_postprocessing"]);
    expect((events[0] as { room_name?: string }).room_name).toBe("test_room_123");
  });
  it("wraps a single event", () => {
    expect(normalizeEvents({ event: "call_started", room_name: "r1", phone_number: "+91" })).toHaveLength(1);
  });
});
