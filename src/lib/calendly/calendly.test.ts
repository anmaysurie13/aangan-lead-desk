import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { tagBookingUrl, verifyCalendlySignature } from "./client";
import { schedulingMessage } from "../booking/booking";
import { scanAgentTurnsForPricing } from "../guardrail/pricing";

const key = "calendly_test_key";
const body = JSON.stringify({ event: "invitee.created", payload: { tracking: { utm_content: "abc" } } });
const now = 1_790_000_000;
const header = (t: number, b = body, k = key) => `t=${t},v1=${createHmac("sha256", k).update(`${t}.${b}`).digest("hex")}`;

describe("Calendly webhook signature (developer.calendly.com/api-docs/overview/webhooks/webhook-signatures)", () => {
  it("accepts a valid signature", () => expect(verifyCalendlySignature(body, header(now), key, now)).toBe(true));
  it("rejects a tampered body", () => expect(verifyCalendlySignature(body + "x", header(now), key, now)).toBe(false));
  it("rejects older than 3 minutes", () => expect(verifyCalendlySignature(body, header(now - 181), key, now)).toBe(false));
  it("rejects missing header", () => expect(verifyCalendlySignature(body, null, key, now)).toBe(false));
});

describe("booking link + message", () => {
  it("tags the single-use link with our booking id", () => {
    const u = new URL(tagBookingUrl("https://calendly.com/d/abcd-brv8/consultation", "b-123"));
    expect(u.searchParams.get("utm_content")).toBe("b-123");
    expect(u.searchParams.get("utm_source")).toBe("aangan-lead-desk");
  });
  it("caller SMS has slots in IST, the link, and no price", () => {
    const text = schedulingMessage({ name: "Priya Joshi", designer: "Aditi", slots: ["2026-10-12T05:30:00Z"], link: "https://calendly.com/d/x" });
    expect(text).toContain("Hi Priya");
    expect(text).toContain("https://calendly.com/d/x");
    expect(text).toMatch(/11:00\s?am/i); // 05:30Z = 11:00 IST
    expect(scanAgentTurnsForPricing([{ speaker: "agent", text }])).toEqual([]);
  });
});
