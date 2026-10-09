import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Calendly API v2 client. Every endpoint/field below is from developer.calendly.com (fetched 2026-10-09):
 *   GET  /users/me                              users:read
 *   GET  /event_types?user=                     event_types:read
 *   GET  /event_type_available_times            event_types:read (range ≤ 31 days, start not in past)
 *   POST /scheduling_links  {max_event_count:1, owner, owner_type:"EventType"}   scheduling_links:write
 *   POST /webhook_subscriptions                 webhooks:write   (invitee.created / invitee.canceled)
 *   GET  /webhook_subscriptions                 webhooks:read
 * Direct booking (POST /invitees) is NOT used: it needs a paid plan and the invitee's email, which a
 * phone call doesn't reliably capture. We send a single-use link instead (the brief's fallback).
 */

const BASE = "https://api.calendly.com";

function token() {
  const t = process.env.CALENDLY_TOKEN;
  if (!t) throw new Error("CALENDLY_TOKEN is not set");
  return t;
}

export class CalendlyApiError extends Error {
  constructor(readonly status: number, readonly path: string, readonly body: string) {
    super(`Calendly ${path} → ${status}: ${body.slice(0, 300)}`);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new CalendlyApiError(res.status, path, text);
  return (text ? JSON.parse(text) : {}) as T;
}

export type CalendlyUser = { uri: string; name: string; email: string; scheduling_url: string; timezone: string; current_organization: string };
export type CalendlyEventType = { uri: string; name: string; active: boolean; slug: string; duration: number; scheduling_url: string; kind?: string };
export type AvailableTime = { status: string; invitees_remaining: number; start_time: string; scheduling_url: string };

export const getMe = () => call<{ resource: CalendlyUser }>("GET", "/users/me").then((r) => r.resource);

export async function listEventTypes(userUri: string): Promise<CalendlyEventType[]> {
  const r = await call<{ collection: CalendlyEventType[] }>("GET", `/event_types?user=${encodeURIComponent(userUri)}&active=true&count=100`);
  return r.collection;
}

/** Next available start times (UTC) for an event type, searching up to `days` ahead (≤ 31 per request). */
export async function availableTimes(eventTypeUri: string, days = 14, from = new Date()): Promise<AvailableTime[]> {
  // "start_time cannot be in the past": add a small buffer.
  const start = new Date(Math.max(from.getTime(), Date.now()) + 5 * 60_000);
  const end = new Date(start.getTime() + Math.min(days, 31) * 86_400_000 - 60_000);
  const q = new URLSearchParams({ event_type: eventTypeUri, start_time: start.toISOString(), end_time: end.toISOString() });
  const r = await call<{ collection: AvailableTime[] }>("GET", `/event_type_available_times?${q}`);
  return r.collection.filter((t) => t.status === "available").sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export async function createSingleUseLink(eventTypeUri: string): Promise<string> {
  const r = await call<{ resource: { booking_url: string } }>("POST", "/scheduling_links", {
    max_event_count: 1,
    owner: eventTypeUri,
    owner_type: "EventType",
  });
  return r.resource.booking_url;
}

export async function listWebhookSubscriptions(organization: string, user: string) {
  const q = new URLSearchParams({ organization, user, scope: "user" });
  return call<{ collection: { uri: string; callback_url: string; events: string[]; state: string }[] }>("GET", `/webhook_subscriptions?${q}`);
}

export async function createWebhookSubscription(opts: { url: string; organization: string; user: string; signingKey: string }) {
  return call<{ resource: { uri: string } }>("POST", "/webhook_subscriptions", {
    url: opts.url,
    events: ["invitee.created", "invitee.canceled"],
    organization: opts.organization,
    user: opts.user,
    scope: "user",
    signing_key: opts.signingKey,
  });
}

/** Calendly-Webhook-Signature: t=<unix>,v1=<hex HMAC-SHA256(key, `${t}.${rawBody}`)>; reject if older than 3 minutes. */
export function verifyCalendlySignature(rawBody: string, header: string | null, key: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !Number.isFinite(Number(t))) return false;
  if (nowSec - Number(t) > 180) return false;
  const expected = createHmac("sha256", key).update(`${t}.${rawBody}`, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Tags a booking link so invitee.created can be matched back to our booking row (tracking.utm_* on the invitee). */
export function tagBookingUrl(bookingUrl: string, bookingId: string): string {
  const u = new URL(bookingUrl);
  u.searchParams.set("utm_source", "aangan-lead-desk");
  u.searchParams.set("utm_content", bookingId);
  return u.toString();
}
