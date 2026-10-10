import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { isAuthed, requireAuth, verifySignedParams } from "@/lib/auth";
import { formatIst } from "@/lib/booking/booking";
import { parseTranscript } from "@/lib/transcript";
import { PHOTOS } from "@/lib/photos";
import { DeskFrame, Tag } from "@/components/desk";

export const dynamic = "force-dynamic";

const CRITERIA: [string, string][] = [
  ["real_project", "Real project (design + execution)"],
  ["service_area", "In our service area"],
  ["timeline", "Realistic timeline"],
  ["budget", "Budget (never asked)"],
  ["decision_maker", "Decision-maker"],
];
const dt = (d: Date | null) => (d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "–");
const v = (x: unknown) => (x === null || x === undefined || x === "" ? "unknown" : String(x));

/** Lead detail + transcript. Open to a signed-in dashboard user, or to a designer via the signed link in their brief email. */
export default async function Lead({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const id = sp.e;
  const params = new URLSearchParams(sp);
  if (!(await isAuthed()) && !verifySignedParams("lead", params)) await requireAuth(`/lead?e=${id ?? ""}`);
  if (!id) notFound();

  const d = db();
  const [e] = await d.select().from(schema.enquiries).where(eq(schema.enquiries.id, id)).limit(1);
  if (!e) notFound();
  const [caller] = e.callerId ? await d.select().from(schema.callers).where(eq(schema.callers.id, e.callerId)).limit(1) : [];
  const [qr] = await d.select().from(schema.qualificationResults).where(eq(schema.qualificationResults.enquiryId, id)).orderBy(desc(schema.qualificationResults.createdAt)).limit(1);
  const calls = await d.select().from(schema.calls).where(eq(schema.calls.enquiryId, id)).orderBy(schema.calls.receivedAt);
  const [booking] = await d.select().from(schema.bookings).where(eq(schema.bookings.enquiryId, id)).orderBy(desc(schema.bookings.createdAt)).limit(1);
  const mails = await d.select().from(schema.notifications).where(eq(schema.notifications.enquiryId, id)).orderBy(schema.notifications.createdAt);

  const criteria = (qr?.criteria ?? {}) as Record<string, { status: string; evidence_quote: string }>;
  const slots = (booking?.offeredSlots as string[] | null) ?? [];
  const facts: [string, unknown][] = [
    ["Phone", caller?.phone], ["Email", e.callerEmail], ["Locality", e.locality], ["Property", [e.propertyType, e.bhk].filter(Boolean).join(" · ")],
    ["Carpet area", e.carpetAreaSqft ? `${e.carpetAreaSqft} sq ft` : null], ["Scope", e.scope], ["Current state", e.currentState], ["Timeline", e.timelineText],
    ["Owned / rented", e.ownership], ["Decision-maker", e.decisionMakerStatus], ["Referral", e.referralSource], ["Language", e.language], ["Site visit", e.siteVisitRequested],
  ];

  return (
    <DeskFrame
      active="leads"
      hero={{
        image: PHOTOS.monthly,
        eyebrow: `Aangan Studio · Lead · ${dt(e.firstCallAt)}`,
        title: e.callerName ?? "Unknown caller",
        meta: [e.bhk ?? e.propertyType, e.locality].filter(Boolean).join(" · ") || "Details not captured",
        extra: <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}><Tag tone={qr?.outcome === "ESCALATED" ? "clay" : qr?.outcome === "DECLINED" ? undefined : "sage"}>{(qr?.outcome ?? e.status).replaceAll("_", " ").toLowerCase()}</Tag>{qr && <Tag tone="teal">score {qr.score}</Tag>}{qr?.frustrationFlag && <Tag tone="clay">frustrated caller</Tag>}</div>,
      }}
    >
      <p style={{ marginBottom: 18 }}><Link className="d-pill" href="/dashboard">← All leads</Link></p>

      <div className="d-grid cols-2">
        <section className="d-card">
          <h2>Summary</h2>
          <p style={{ whiteSpace: "pre-line", fontWeight: 700 }}>{qr?.summary3Lines ?? "Not scored yet."}</p>
          {qr && (qr.openQuestions as string[]).length > 0 && (
            <>
              <div className="d-label" style={{ margin: "18px 0 8px" }}>Still to ask</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>{(qr.openQuestions as string[]).map((q) => <li key={q}>{q}</li>)}</ul>
            </>
          )}
          {e.issue && <p className="d-quote" style={{ marginTop: 18 }}>{e.issue}</p>}
        </section>
        <section className="d-card">
          <h2>What we know</h2>
          <table className="d-table"><tbody>{facts.map(([k, val]) => <tr key={k}><td className="d-label" style={{ width: 150 }}>{k}</td><td>{v(val)}</td></tr>)}</tbody></table>
        </section>
      </div>

      <section className="d-card" style={{ marginTop: 20 }}>
        <h2>Against Nikhil&apos;s five criteria</h2>
        <table className="d-table">
          <tbody>
            {CRITERIA.map(([k, label]) => {
              const c = criteria[k];
              return (
                <tr key={k}>
                  <td style={{ width: 280, fontWeight: 800 }}>{label}</td>
                  <td style={{ width: 120 }}><Tag tone={c?.status === "pass" ? "sage" : c?.status === "fail" ? "clay" : "brass"}>{c?.status ?? "n/a"}</Tag></td>
                  <td>{c?.evidence_quote ? <span className="d-quote">{c.evidence_quote}</span> : <span className="d-note">no evidence needed</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {qr && <p className="d-note" style={{ marginTop: 12 }}>Decision trail: {((qr.rawJson as { rule_trace?: string[] })?.rule_trace ?? []).join("; ") || "n/a"} · knowledge {qr.knowledgeVersion}</p>}
      </section>

      <div className="d-grid cols-2" style={{ marginTop: 20 }}>
        <section className="d-card">
          <h2>Booking</h2>
          {booking ? (
            <>
              <p><Tag tone={booking.status === "booked" || booking.status === "held" ? "sage" : "brass"}>{booking.status.replace("_", " ")}</Tag></p>
              {booking.slotStart && <p style={{ marginTop: 10, fontWeight: 800 }}>Consultation: {formatIst(booking.slotStart.toISOString())} IST</p>}
              {slots.length > 0 && <p className="d-note" style={{ marginTop: 8 }}>Offered: {slots.map(formatIst).join(" · ")}</p>}
              {booking.schedulingLink && <p style={{ marginTop: 10, wordBreak: "break-all" }}><a style={{ textDecoration: "underline" }} href={booking.schedulingLink}>Single-use booking link</a></p>}
              {booking.error && <p className="d-alert" style={{ marginTop: 10 }}>{booking.error}</p>}
            </>
          ) : <p className="d-note">No booking yet.</p>}
        </section>
        <section className="d-card">
          <h2>Timeline</h2>
          <table className="d-table"><tbody>
            {([["First call", e.firstCallAt], ["Scored", e.scoredAt], ["Brief emailed", e.briefSentAt], ["Designer accepted", e.claimedAt], ["Booked", e.bookedAt], ["Consultation held", e.consultationHeldAt]] as [string, Date | null][]).map(([k, t]) => <tr key={k}><td className="d-label">{k}</td><td>{dt(t)}</td></tr>)}
          </tbody></table>
          {mails.length > 0 && <p className="d-note" style={{ marginTop: 12 }}>Emails: {mails.map((m) => `${m.kind.replace("_", " ")} → ${m.delivered ? "sent" : m.error ?? "not sent"}`).join(" · ")}</p>}
        </section>
      </div>

      <section className="d-card" style={{ marginTop: 20 }}>
        <h2>Transcript{calls.length > 1 ? "s (merged calls)" : ""}</h2>
        {calls.length ? calls.map((c, i) => (
          <div key={c.id} style={{ marginTop: i ? 24 : 0 }}>
            <p className="d-label" style={{ marginBottom: 10 }}>Call {i + 1} · {dt(c.answeredAt ?? c.receivedAt)} · {c.durationSec ? `${Math.round(c.durationSec / 60)} min` : "duration n/a"}{c.pricingBreach ? " · PRICE QUOTED, REVIEW" : ""}</p>
            <div className="d-transcript">
              {parseTranscript(c.transcriptText ?? "").map((t, j) => <div key={j} className={`d-turn ${t.speaker}`}><small>{t.speaker === "agent" ? "AANGAN" : "CALLER"}</small>{t.text}</div>)}
              {!c.transcriptText && <p className="d-note">No transcript received.</p>}
            </div>
          </div>
        )) : <p className="d-note">No calls linked.</p>}
      </section>
    </DeskFrame>
  );
}
