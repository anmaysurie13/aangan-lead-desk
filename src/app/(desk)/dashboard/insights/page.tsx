import { requireAuth } from "@/lib/auth";
import { buildSummary, declineCategory, fetchHourly, inr, lakh, parseRange } from "@/lib/metrics";
import { PHOTOS } from "@/lib/photos";
import { BarRow, DeskFrame, Empty, Kpi } from "@/components/desk";

export const dynamic = "force-dynamic";

export default async function Insights({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; month?: string }> }) {
  const sp = await searchParams;
  await requireAuth("/dashboard/insights");
  const range = sp.from || sp.to || sp.month ? parseRange(sp) : (() => { const r = parseRange({}); return { ...r, from: new Date(Date.now() - 90 * 86_400_000), label: "last 90 days" }; })();
  const [s, hours] = await Promise.all([buildSummary(range), fetchHourly(range)]);

  const E = s.enquiries;
  const declined = E.filter((e) => e.outcome === "DECLINED");
  const reasons = new Map<string, number>();
  declined.forEach((e) => reasons.set(declineCategory(e), (reasons.get(declineCategory(e)) ?? 0) + 1));
  const reasonRows = [...reasons].sort((a, b) => b[1] - a[1]);
  const asked = E.filter((e) => e.asked_price);
  const askedQualified = asked.filter((e) => e.outcome === "QUALIFIED" || e.outcome === "QUALIFIED_WITH_NOTE");
  const askedBooked = asked.filter((e) => e.booked_at);
  const hourMax = Math.max(1, ...hours);
  const where = [
    ["Qualified", s.funnel.qualified, "sage"],
    ["Not a fit", declined.length, undefined],
    ["Existing clients", s.escalations, "clay"],
    ["Needs review", E.filter((e) => e.outcome === "NEEDS_REVIEW").length, "brass"],
  ] as const;
  const whereMax = Math.max(1, ...where.map((w) => w[1]));
  const funnel = [
    ["Calls answered", s.funnel.calls],
    ["Unique enquiries", s.funnel.enquiries],
    ["Qualified", s.funnel.qualified],
    ["Consultation booked", s.funnel.booked],
    ["Designer accepted", s.funnel.claimed],
    ["Consultation held", s.funnel.held],
  ] as const;
  const fmax = Math.max(1, ...funnel.map((f) => f[1]));

  return (
    <DeskFrame
      active="insights"
      hero={{
        image: PHOTOS.insights,
        eyebrow: `Aangan Studio · Insights · ${range.label}`,
        title: "How the front desk is doing",
        extra: <div style={{ marginTop: 22 }}><a className="d-btn ghost" href={`/dashboard/export?${new URLSearchParams({ from: sp.from ?? "", to: sp.to ?? "", month: sp.month ?? "" })}`}>Export CSV</a></div>,
      }}
    >
      <div className="d-grid cols-4">
        <Kpi label="Answered in under 5 min" value={s.answeredWithin5Pct === null ? "–" : `${s.answeredWithin5Pct}%`} note={`${s.calls.total} calls · target 100%`} />
        <Kpi label="After hours" value={s.calls.outOfHours} note={s.outOfHoursPct === null ? "no calls yet" : `${s.outOfHoursPct}% of calls, all answered`} />
        <Kpi label="Qualified" value={s.funnel.qualified} note={`of ${s.funnel.enquiries} enquiries`} />
        <Kpi label="Cost per qualified lead" value={s.perQualified === null ? "–" : inr(s.perQualified)} note={s.costs.missingRates.length ? "rate cards incomplete" : "all vendors included"} />
      </div>

      <div className="d-grid cols-2" style={{ marginTop: 20 }}>
        <section className="d-card">
          <h2>When people call</h2>
          <p className="d-note" style={{ marginBottom: 16 }}>{s.calls.outOfHours} of {s.calls.total} calls came while the front desk was closed.</p>
          <div className="d-hours" role="img" aria-label="Calls by hour of day">
            {hours.map((n, h) => <div key={h} className={h >= 10 && h < 19 ? "open" : ""} style={{ height: `${(n / hourMax) * 100}%` }} title={`${h}:00 · ${n} calls`} />)}
          </div>
          <div className="d-hours-axis"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
          <p className="d-note" style={{ marginTop: 10 }}>Dark bars = the 10am to 7pm window the desk used to cover.</p>
        </section>

        <section className="d-card">
          <h2>Before and now</h2>
          <div className="d-ba">
            <div className="before"><div className="d-label">Last month, by hand</div><div className="d-big">{s.response.baselineUnansweredPct}%</div><p className="d-note">of ~200 enquiries had no reply after 48 hours.</p></div>
            <div className="after"><div className="d-label">With the front desk</div><div className="d-big">{s.response.liveWithin5Pct === null ? "–" : `${Math.round(100 - s.response.liveWithin5Pct)}%`}</div><p className="d-note">unanswered{s.response.measured ? ` (${s.response.measured} calls timed)` : ""}. Every call picked up live, day or night.</p></div>
          </div>
        </section>
      </div>

      <div className="d-grid cols-2" style={{ marginTop: 20 }}>
        <section className="d-card">
          <h2>From call to consultation</h2>
          <div className="d-bars">{funnel.map(([l, n]) => <BarRow key={l} label={l} n={n} max={fmax} />)}</div>
          <p className="d-note" style={{ marginTop: 14 }}>Median hang-up to designer pickup: <b>{s.medianPickupMin === null ? "no pickups yet" : `${Math.round(s.medianPickupMin)} min`}</b>. Pipeline: <b>{lakh(s.pipeline.low)}–{lakh(s.pipeline.high)}</b>.</p>
        </section>
        <section className="d-card">
          <h2>Where enquiries went</h2>
          <div className="d-bars">{where.map(([l, n, tone]) => <BarRow key={l} label={l} n={n} max={whereMax} tone={tone} />)}</div>
        </section>
      </div>

      <div className="d-grid cols-2" style={{ marginTop: 20 }}>
        <section className="d-card">
          <h2>Why some weren&apos;t a fit</h2>
          {reasonRows.length ? <div className="d-bars">{reasonRows.map(([l, n]) => <BarRow key={l} label={l} n={n} max={reasonRows[0][1]} tone="clay" />)}</div> : <Empty>No declined enquiries in this period.</Empty>}
        </section>
        <section className="d-card">
          <div className="d-label">The cut</div>
          <h2 style={{ marginTop: 6 }}>Asked the price</h2>
          <div className="d-bars">
            <BarRow label="Asked the price" n={asked.length} max={Math.max(1, asked.length)} tone="brass" />
            <BarRow label="…still qualified" n={askedQualified.length} max={Math.max(1, asked.length)} tone="sage" />
            <BarRow label="…booked" n={askedBooked.length} max={Math.max(1, asked.length)} />
            <BarRow label="Prices quoted by the agent" n={s.calls.breaches} max={Math.max(1, asked.length)} tone="clay" />
          </div>
          <p className="d-note" style={{ marginTop: 14 }}>Nikhil asked for instant per-sq-ft quotes; his own pricing guide says never quote. The assistant gives his approved line and offers the free consultation. A price question never disqualifies.</p>
        </section>
      </div>

      <section className="d-card" style={{ marginTop: 20 }}>
        <h2>Cost</h2>
        <div className="d-grid cols-4">
          {[["Per call", s.perCall], ["Per qualified lead", s.perQualified], ["Per booking", s.perBooking], ["Total spend", s.costs.totalInr]].map(([l, v]) => (
            <div key={String(l)}><div className="d-label">{l}</div><div className="d-kpi" style={{ fontSize: 34 }}>{v === null ? "–" : inr(Number(v))}</div></div>
          ))}
        </div>
        <table className="d-table" style={{ marginTop: 16 }}>
          <tbody>
            {s.costs.lines.length ? s.costs.lines.map((l) => <tr key={l.vendor}><td>{l.vendor}</td><td>{inr(l.inr)}</td><td className="d-note">{l.detail}</td></tr>) : <tr><td className="d-note">No usage recorded yet.</td></tr>}
          </tbody>
        </table>
        <p className="d-note" style={{ marginTop: 12 }}>Pipeline {lakh(s.pipeline.low)}–{lakh(s.pipeline.high)} against spend {inr(s.costs.totalInr)}{s.costs.totalInr > 0 ? ` (${Math.round(s.pipeline.low / s.costs.totalInr)}× to ${Math.round(s.pipeline.high / s.costs.totalInr)}×)` : ""}.</p>
        {s.costs.missingRates.length > 0 && <p className="d-alert" style={{ marginTop: 12 }}>Rates still needed (costs understated): {s.costs.missingRates.join("; ")}.</p>}
      </section>
    </DeskFrame>
  );
}
