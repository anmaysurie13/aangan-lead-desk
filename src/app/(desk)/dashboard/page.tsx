import Link from "next/link";
import { db, schema } from "@/db/client";
import { requireAuth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { BUCKET_LABEL, fetchEnquiries, leadBucket, parseRange, type Bucket, type EnquiryRow } from "@/lib/metrics";
import { PHOTOS } from "@/lib/photos";
import { DeskFrame, Empty, Tag } from "@/components/desk";
import { markConsultationHeld, resolveReview } from "./actions";

export const dynamic = "force-dynamic";

type Params = { tab?: string; q?: string; from?: string; to?: string; designer?: string; outcome?: string; all?: string };
const TABS: (Bucket | "all")[] = ["needs", "new", "progress", "booked", "declined", "all"];
const OUTCOMES = ["QUALIFIED", "QUALIFIED_WITH_NOTE", "DECLINED", "ESCALATED", "NEEDS_REVIEW"];

const fmt = (d: Date | null) => (d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "–");
const greeting = () => {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};
const today = () => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(new Date());

function tagFor(e: EnquiryRow, bucket: Bucket) {
  if (e.outcome === "ESCALATED") return <Tag tone="clay">Existing client</Tag>;
  if (e.status === "NEEDS_REVIEW") return <Tag tone="brass">Needs review</Tag>;
  if (bucket === "booked") return <Tag tone="teal">{e.consultation_held_at ? "Consultation held" : "Booked"}</Tag>;
  if (bucket === "progress") return <Tag tone="teal">With designer</Tag>;
  if (bucket === "declined") return <Tag>Not a fit</Tag>;
  if (e.outcome === "QUALIFIED_WITH_NOTE") return <Tag tone="sage">Qualified · see note</Tag>;
  return <Tag tone="sage">Qualified</Tag>;
}

export default async function Leads({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  await requireAuth(`/dashboard${qs ? `?${qs}` : ""}`);

  const now = new Date();
  const range = sp.from || sp.to ? parseRange(sp) : { from: new Date(now.getTime() - 120 * 86_400_000), to: new Date(now.getTime() + 86_400_000), label: "recent" };
  const [rows, designers, sla] = await Promise.all([
    fetchEnquiries({ ...range, designerId: sp.designer || undefined, outcome: sp.outcome || undefined }),
    db().select({ id: schema.designers.id, name: schema.designers.name }).from(schema.designers),
    getConfig("sla_claim_minutes", 30),
  ]);

  const needle = (sp.q ?? "").trim().toLowerCase();
  const matched = needle ? rows.filter((e) => [e.caller_name, e.locality, e.bhk, e.property_type, e.designer_name].some((x) => x?.toLowerCase().includes(needle))) : rows;
  const bucketOf = new Map(matched.map((e) => [e.id, leadBucket(e, now, Number(sla))]));
  const count = (b: Bucket) => matched.filter((e) => bucketOf.get(e.id) === b).length;
  const active = (TABS.includes(sp.tab as Bucket | "all") ? sp.tab : count("needs") ? "needs" : "all") as Bucket | "all";
  const shown = (active === "all" ? matched : matched.filter((e) => bucketOf.get(e.id) === active)).slice(0, 60);

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return `/dashboard${s ? `?${s}` : ""}`;
  };

  return (
    <DeskFrame
      active="leads"
      hero={{
        image: PHOTOS.leads,
        eyebrow: `Aangan Studio · Pune · ${today()}`,
        title: greeting(),
        meta: (
          <>
            <b>{count("needs")}</b> need you · <b>{count("new")}</b> new · <b>{count("booked")}</b> booked
          </>
        ),
        tagline: "Every enquiry answered. Every designer briefed.",
      }}
    >
      <div className="d-chips" role="tablist">
        {TABS.map((t) => (
          <Link key={t} href={link({ tab: t })} className="d-pill" aria-current={t === active} role="tab">
            {t === "needs" && count("needs") > 0 && <span className="dot" />}
            {t === "all" ? "All" : BUCKET_LABEL[t]} <span className="n">{t === "all" ? matched.length : count(t)}</span>
          </Link>
        ))}
      </div>

      <div className="d-search">
        <form method="get">
          {active && <input type="hidden" name="tab" value={active} />}
          <input className="d-input" name="q" placeholder="Search name, locality, BHK or designer" defaultValue={sp.q} aria-label="Search leads" />
        </form>
        <details className="d-filters">
          <summary className="d-pill">Filters</summary>
          <form className="d-pop" method="get">
            <input type="hidden" name="tab" value={active} />
            <label>From<input className="d-input" type="date" name="from" defaultValue={sp.from} /></label>
            <label>To<input className="d-input" type="date" name="to" defaultValue={sp.to} /></label>
            <label>Designer
              <select className="d-input" name="designer" defaultValue={sp.designer ?? ""}>
                <option value="">All</option>
                {designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label>Outcome
              <select className="d-input" name="outcome" defaultValue={sp.outcome ?? ""}>
                <option value="">All</option>
                {OUTCOMES.map((o) => <option key={o} value={o}>{o.replaceAll("_", " ").toLowerCase()}</option>)}
              </select>
            </label>
            <button className="d-btn" type="submit">Apply</button>
            <a className="d-btn ghost" href={`/dashboard/export?${new URLSearchParams({ from: sp.from ?? "", to: sp.to ?? "", designer: sp.designer ?? "", outcome: sp.outcome ?? "" })}`}>Export CSV</a>
          </form>
        </details>
      </div>

      {shown.length === 0 ? (
        <div className="d-card"><Empty>{matched.length === 0 ? "No enquiries yet. They appear here seconds after each call." : "Nothing in this list."}</Empty></div>
      ) : (
        <div className="d-grid cols-2">
          {shown.map((e) => {
            const bucket = bucketOf.get(e.id)!;
            const tone = e.outcome === "ESCALATED" ? "clay" : e.status === "NEEDS_REVIEW" ? "brass" : bucket === "declined" ? "" : bucket === "booked" || bucket === "progress" ? "teal" : "sage";
            const where = [e.bhk ?? e.property_type, e.locality, e.carpet_area_sqft ? `${e.carpet_area_sqft} sq ft` : null].filter(Boolean).join(" · ");
            const say = e.outcome === "ESCALATED" ? e.issue : e.summary?.split("\n")[1] ?? e.summary;
            return (
              <article key={e.id} className={`d-card d-lead ${tone}`}>
                <div className="d-lead-head">
                  {tagFor(e, bucket)}
                  <span className="d-when">{fmt(e.first_call_at)}</span>
                </div>
                <h3><Link href={`/lead?e=${e.id}`}>{e.caller_name ?? "Unknown caller"}</Link></h3>
                <div className="where">{where || "Details not captured"}</div>
                {say && <p className={`say ${e.outcome === "ESCALATED" ? "clay" : ""}`}>{say}</p>}
                <div className="d-lead-foot">
                  <span>
                    {e.designer_name ? `Designer: ${e.designer_name}` : e.owner_type === null ? <b style={{ color: "var(--clay)" }}>No owner</b> : `Owner: ${e.owner_type}`}
                    {e.asked_price ? " · asked the price" : ""}
                    {e.frustration ? " · frustrated" : ""}
                  </span>
                  <span className="d-act">
                    {e.status === "NEEDS_REVIEW" && (
                      <span style={{ display: "inline-flex", gap: 8 }}>
                        <form action={resolveReview}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="qualify" /><button className="d-btn sm" type="submit">Qualify</button></form>
                        <form action={resolveReview}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="decline" /><button className="d-btn sm ghost" type="submit">Decline</button></form>
                      </span>
                    )}
                    {bucket === "booked" && !e.consultation_held_at && (
                      <form action={markConsultationHeld}><input type="hidden" name="id" value={e.id} /><button className="d-btn sm brass" type="submit">Mark held</button></form>
                    )}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </DeskFrame>
  );
}
