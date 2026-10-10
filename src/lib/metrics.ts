import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getConfig } from "@/lib/config";

/**
 * Dashboard numbers (Checks 01, 05, 08). Everything is computed from stored timestamps and rows;
 * nothing is estimated. The only derived-from-config figures are labelled: pipeline value (qualified × avg
 * project value range) and fixed monthly costs (pro-rated by days).
 */
export type Filters = { from: Date; to: Date; designerId?: string; outcome?: string };

export type EnquiryRow = {
  id: string;
  status: string;
  owner_type: string | null;
  decline_reason: string | null;
  caller_name: string | null;
  locality: string | null;
  assigned_designer_id: string | null;
  designer_name: string | null;
  first_call_at: Date | null;
  last_call_at: Date | null;
  claimed_at: Date | null;
  booked_at: Date | null;
  consultation_held_at: Date | null;
  brief_rating: number | null;
  outcome: string | null;
  score: number | null;
  intent: string | null;
  summary: string | null;
  frustration: boolean | null;
  criteria: Record<string, { status: string; evidence_quote: string }> | null;
  bhk: string | null;
  property_type: string | null;
  carpet_area_sqft: number | null;
  issue: string | null;
  timeline_text: string | null;
  asked_price: boolean;
};

const QUALIFIED_OUTCOMES = ["QUALIFIED", "QUALIFIED_WITH_NOTE"];
const iso = (d: Date) => d.toISOString();

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const pct = (n: number, d: number): number | null => (d ? Math.round((n / d) * 1000) / 10 : null);

export async function fetchEnquiries(f: Filters): Promise<EnquiryRow[]> {
  const designer = f.designerId ? sql`and e.assigned_designer_id = ${f.designerId}` : sql``;
  const r = await db().execute(sql`
    with last_qr as (
      select distinct on (enquiry_id) enquiry_id, outcome, score, intent, summary_3_lines, frustration_flag, criteria
      from qualification_results order by enquiry_id, created_at desc
    ),
    asked as (
      select enquiry_id, bool_or(transcript_text ~* 'CALLER:[^\n]*(how much|cost|price|rate|ballpark|per sq|kitna|कितना|दाम|कीमत)') as asked_price
      from calls where enquiry_id is not null group by 1
    )
    select e.id, e.status, e.owner_type, e.decline_reason, e.caller_name, e.locality, e.assigned_designer_id,
           d.name as designer_name, e.first_call_at, e.last_call_at, e.claimed_at, e.booked_at,
           e.consultation_held_at, e.brief_rating, q.outcome, q.score, q.intent, q.summary_3_lines as summary,
           q.frustration_flag as frustration, q.criteria, e.bhk, e.property_type, e.carpet_area_sqft, e.issue, e.timeline_text,
           coalesce(a.asked_price, false) as asked_price
    from enquiries e
    left join last_qr q on q.enquiry_id = e.id
    left join asked a on a.enquiry_id = e.id
    left join designers d on d.id = e.assigned_designer_id
    where e.first_call_at >= ${iso(f.from)}::timestamptz and e.first_call_at < ${iso(f.to)}::timestamptz
    ${designer}
    order by e.first_call_at desc
    limit 5000`);
  const rows = (r.rows as Record<string, unknown>[]).map((x) => ({
    ...(x as unknown as EnquiryRow),
    first_call_at: x.first_call_at ? new Date(x.first_call_at as string) : null,
    last_call_at: x.last_call_at ? new Date(x.last_call_at as string) : null,
    claimed_at: x.claimed_at ? new Date(x.claimed_at as string) : null,
    booked_at: x.booked_at ? new Date(x.booked_at as string) : null,
    consultation_held_at: x.consultation_held_at ? new Date(x.consultation_held_at as string) : null,
  }));
  return f.outcome ? rows.filter((x) => x.outcome === f.outcome) : rows;
}

export type CallStats = { total: number; outOfHours: number; measured: number; within5: number; breaches: number; seconds: number };

export async function fetchCallStats(f: Filters): Promise<CallStats> {
  const designer = f.designerId ? sql`and e.assigned_designer_id = ${f.designerId}` : sql``;
  const r = await db().execute(sql`
    select count(*)::int as total,
           count(*) filter (where c.in_hours = false)::int as out_of_hours,
           count(*) filter (where c.ring_started_at is not null and c.answered_at is not null)::int as measured,
           count(*) filter (where c.ring_started_at is not null and c.answered_at is not null
                            and c.answered_at - c.ring_started_at < interval '5 minutes')::int as within5,
           count(*) filter (where c.pricing_breach)::int as breaches,
           coalesce(sum(c.duration_sec), 0)::int as seconds
    from calls c left join enquiries e on e.id = c.enquiry_id
    where c.received_at >= ${iso(f.from)}::timestamptz and c.received_at < ${iso(f.to)}::timestamptz ${designer}`);
  const x = r.rows[0] as Record<string, number>;
  return { total: x.total, outOfHours: x.out_of_hours, measured: x.measured, within5: x.within5, breaches: x.breaches, seconds: x.seconds };
}

export type CostLine = { vendor: string; inr: number; detail: string };

export async function fetchCosts(f: Filters): Promise<{ lines: CostLine[]; variableInr: number; fixedInr: number; totalInr: number; missingRates: string[] }> {
  const r = await db().execute(sql`
    select vendor, unit, sum(qty)::float as qty, sum(total_inr)::float as inr
    from cost_events where occurred_at >= ${iso(f.from)}::timestamptz and occurred_at < ${iso(f.to)}::timestamptz
    group by 1, 2 order by 1, 2`);
  const byVendor = new Map<string, { inr: number; parts: string[] }>();
  for (const row of r.rows as { vendor: string; unit: string; qty: number; inr: number }[]) {
    const v = byVendor.get(row.vendor) ?? { inr: 0, parts: [] };
    v.inr += row.inr;
    v.parts.push(`${Math.round(row.qty).toLocaleString("en-IN")} ${row.unit.replace("_", " ")}${row.qty === 1 ? "" : "s"}`);
    byVendor.set(row.vendor, v);
  }
  const lines: CostLine[] = [...byVendor].map(([vendor, v]) => ({ vendor, inr: v.inr, detail: v.parts.join(" · ") }));
  const missingRates: string[] = [];
  if ((await getConfig("rate_card_gemini", null)) === null && byVendor.has("gemini")) missingRates.push("Gemini rate card (₹ per million tokens)");
  if ((await getConfig("rate_card_vaani_per_minute_inr", null)) === null) missingRates.push("Vaani per-minute rate");

  const fixed = await getConfig<Record<string, number> | null>("fixed_monthly_inr", null);
  const days = (f.to.getTime() - f.from.getTime()) / 86_400_000;
  let fixedInr = 0;
  if (fixed) {
    for (const [k, monthly] of Object.entries(fixed)) {
      const inr = (Number(monthly) || 0) * (days / 30);
      fixedInr += inr;
      lines.push({ vendor: `${k} (fixed)`, inr, detail: `₹${monthly}/month, pro-rated for ${Math.round(days)} days` });
    }
  } else missingRates.push("Fixed monthly costs (Vercel, Neon, email)");

  const variableInr = [...byVendor.values()].reduce((a, v) => a + v.inr, 0);
  return { lines, variableInr, fixedInr, totalInr: variableInr + fixedInr, missingRates };
}

export type Summary = Awaited<ReturnType<typeof buildSummary>>;

export async function buildSummary(f: Filters) {
  const [enquiries, calls, costs, avg, baseline] = await Promise.all([
    fetchEnquiries(f),
    fetchCallStats(f),
    fetchCosts(f),
    getConfig("avg_project_value_inr", { low: 800000, high: 1400000 }),
    getConfig("baseline_unanswered_48h_pct", 48),
  ]);

  const qualified = enquiries.filter((e) => e.outcome && QUALIFIED_OUTCOMES.includes(e.outcome));
  const booked = enquiries.filter((e) => e.booked_at);
  const claimed = enquiries.filter((e) => e.claimed_at);
  const held = enquiries.filter((e) => e.consultation_held_at);
  const pickupMins = claimed.filter((e) => e.last_call_at).map((e) => (e.claimed_at!.getTime() - e.last_call_at!.getTime()) / 60_000);

  const declines = new Map<string, number>();
  for (const e of enquiries.filter((x) => x.outcome === "DECLINED")) {
    const k = (e.decline_reason ?? "unspecified").slice(0, 70);
    declines.set(k, (declines.get(k) ?? 0) + 1);
  }
  const unclaimed = qualified.filter((e) => !e.claimed_at && !e.booked_at && !["CLAIMED", "BOOKED", "CONSULTATION_HELD", "CLOSED"].includes(e.status));
  const ratings = enquiries.map((e) => e.brief_rating).filter((x): x is number => x != null);

  const pipeline = { low: qualified.length * avg.low, high: qualified.length * avg.high };
  const liveWithin5Pct = pct(calls.within5, calls.measured);
  return {
    filters: f,
    calls,
    enquiries,
    funnel: { calls: calls.total, enquiries: enquiries.length, qualified: qualified.length, booked: booked.length, claimed: claimed.length, held: held.length },
    outcomes: countBy(enquiries.map((e) => e.outcome ?? "UNSCORED")),
    escalations: enquiries.filter((e) => e.outcome === "ESCALATED").length,
    needsReview: enquiries.filter((e) => e.outcome === "NEEDS_REVIEW" && !["CLOSED"].includes(e.status)),
    declineReasons: [...declines].sort((a, b) => b[1] - a[1]),
    medianPickupMin: median(pickupMins),
    unclaimed,
    unowned: enquiries.filter((e) => e.owner_type === null || (e.owner_type === "system" && e.outcome && QUALIFIED_OUTCOMES.includes(e.outcome) && !e.claimed_at)),
    avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    ratingCount: ratings.length,
    pipeline,
    pipelineAvg: avg,
    costs,
    perQualified: qualified.length ? costs.totalInr / qualified.length : null,
    perBooking: booked.length ? costs.totalInr / booked.length : null,
    perCall: calls.total ? costs.totalInr / calls.total : null,
    response: { liveWithin5Pct, measured: calls.measured, baselineUnansweredPct: baseline },
    outOfHoursPct: pct(calls.outOfHours, calls.total),
    answeredWithin5Pct: liveWithin5Pct,
  };
}

function countBy(xs: string[]) {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

/** Parses ?from=&to= (YYYY-MM-DD, IST days) with a default of the current IST month. */
export function parseRange(params: { from?: string; to?: string; month?: string }): { from: Date; to: Date; label: string } {
  const IST = 5.5 * 3600_000;
  const startOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 1) - IST);
  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    const [y, m] = params.month.split("-").map(Number);
    return { from: startOfMonth(y, m - 1), to: startOfMonth(y, m), label: params.month };
  }
  const day = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d) - IST);
  };
  if (params.from && params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.from) && /^\d{4}-\d{2}-\d{2}$/.test(params.to)) {
    return { from: day(params.from), to: new Date(day(params.to).getTime() + 86_400_000), label: `${params.from} → ${params.to}` };
  }
  const nowIst = new Date(Date.now() + IST);
  const y = nowIst.getUTCFullYear();
  const m = nowIst.getUTCMonth();
  return { from: startOfMonth(y, m), to: startOfMonth(y, m + 1), label: `${y}-${String(m + 1).padStart(2, "0")}` };
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const lakh = (n: number) => `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;

// ---------- lead buckets (Leads tab) ----------
export type Bucket = "needs" | "new" | "progress" | "booked" | "declined";
export const BUCKET_LABEL: Record<Bucket, string> = { needs: "Needs you", new: "New", progress: "In progress", booked: "Booked", declined: "Not qualified" };

/**
 * Mutually exclusive. "Needs you" = a human must act: escalations, review items, unowned leads, or a qualified lead
 * nobody has claimed within the SLA. "New" = qualified and still inside the SLA window.
 */
export function leadBucket(e: EnquiryRow, now: Date, slaMinutes: number): Bucket {
  if (e.consultation_held_at || e.booked_at || e.status === "BOOKED" || e.status === "CONSULTATION_HELD") return "booked";
  if (e.outcome === "DECLINED" || e.status === "DECLINED" || e.status === "CLOSED") return "declined";
  if (e.outcome === "ESCALATED" || e.status === "ESCALATED" || e.status === "NEEDS_REVIEW") return "needs";
  if (e.claimed_at || e.status === "CLAIMED") return "progress";
  if (e.owner_type === null) return "needs";
  const age = e.first_call_at ? (now.getTime() - e.first_call_at.getTime()) / 60_000 : 0;
  return age > slaMinutes ? "needs" : "new";
}

/** Friendly decline category from which criterion failed (not from free text). */
export function declineCategory(e: EnquiryRow): string {
  if (e.intent === "OUT_OF_SCOPE") return "Not a service we offer";
  const c = e.criteria ?? {};
  if (c.service_area?.status === "fail") return "Outside Pune and PCMC";
  if (c.timeline?.status === "fail") return "Timeline too short";
  if (c.real_project?.status === "fail") return "Wanted advice only";
  if (c.budget?.status === "fail") return "Budget far too low";
  return "Other";
}

export async function fetchHourly(f: Filters): Promise<number[]> {
  const r = await db().execute(sql`
    select extract(hour from c.received_at at time zone 'Asia/Kolkata')::int as h, count(*)::int as n
    from calls c where c.received_at >= ${iso(f.from)}::timestamptz and c.received_at < ${iso(f.to)}::timestamptz group by 1`);
  const out = Array<number>(24).fill(0);
  for (const row of r.rows as { h: number; n: number }[]) out[row.h] = row.n;
  return out;
}