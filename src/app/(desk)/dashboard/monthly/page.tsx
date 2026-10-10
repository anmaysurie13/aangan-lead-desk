import { requireAuth } from "@/lib/auth";
import { buildSummary, inr, lakh, parseRange } from "@/lib/metrics";
import { PHOTOS } from "@/lib/photos";
import { DeskFrame } from "@/components/desk";

export const dynamic = "force-dynamic";

/** The "September-style" monthly summary: the numbers Nikhil used to pull by hand, in one page. */
export default async function Monthly({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  await requireAuth("/dashboard/monthly");
  const range = parseRange({ month: sp.month });
  const s = await buildSummary(range);
  const c = s.funnel;
  const row = (label: string, value: React.ReactNode, note?: React.ReactNode) => (
    <tr key={label}><td style={{ fontWeight: 800 }}>{label}</td><td style={{ fontFamily: "var(--serif)", fontSize: 24 }}>{value}</td><td className="d-note">{note}</td></tr>
  );
  return (
    <DeskFrame
      active="monthly"
      hero={{
        image: PHOTOS.monthly,
        eyebrow: "Aangan Studio · Monthly summary",
        title: range.label,
        tagline: "Every figure is computed from stored timestamps. Nothing is estimated.",
        extra: (
          <form method="get" style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input className="d-input" style={{ width: 200 }} type="month" name="month" defaultValue={range.label} aria-label="Month" />
            <button className="d-btn ghost" type="submit">Show</button>
            <a className="d-btn ghost" href={`/dashboard/export?month=${range.label}`}>Export CSV</a>
          </form>
        ),
      }}
    >
      <div className="d-card">
        <table className="d-table">
          <tbody>
            {row("Enquiries (calls answered)", c.calls)}
            {row("Answered in under 5 minutes", s.answeredWithin5Pct === null ? "–" : `${s.answeredWithin5Pct}%`, `${s.response.measured} timed · before launch: ${s.response.baselineUnansweredPct}% unanswered at 48 h`)}
            {row("Out of hours", s.outOfHoursPct === null ? "–" : `${s.outOfHoursPct}%`, `${s.calls.outOfHours} calls`)}
            {row("Qualified", c.qualified, "qualified + qualified with note")}
            {row("Not a fit", s.outcomes.find(([o]) => o === "DECLINED")?.[1] ?? 0, s.declineReasons.map(([r, n]) => `${r} (${n})`).join(" · "))}
            {row("Existing clients (escalated)", s.escalations)}
            {row("Needs review", s.needsReview.length)}
            {row("Booked", c.booked)}
            {row("Designer accepted", c.claimed, s.medianPickupMin === null ? undefined : `median ${Math.round(s.medianPickupMin)} min after hang-up`)}
            {row("Consultations held (manual mark)", c.held)}
            {row("Prices quoted by the agent", s.calls.breaches, "target 0")}
            {row("Pipeline value", `${lakh(s.pipeline.low)}–${lakh(s.pipeline.high)}`, `${c.qualified} qualified × average project value`)}
            {row("Spend", inr(s.costs.totalInr), s.costs.lines.map((l) => `${l.vendor} ${inr(l.inr)}`).join(" · ") || "no usage recorded")}
            {row("Cost per qualified lead", s.perQualified === null ? "–" : inr(s.perQualified))}
            {row("Cost per booking", s.perBooking === null ? "–" : inr(s.perBooking))}
          </tbody>
        </table>
      </div>
    </DeskFrame>
  );
}
